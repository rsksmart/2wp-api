{{- define "mongodb.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Not suffixed per environment: RSK_DB_CONNECTION_HOST is "mongodb" everywhere */}}
{{- define "mongodb.fullname" -}}
{{- default (include "mongodb.name" .) .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "mongodb.headlessName" -}}
{{- printf "%s-headless" (include "mongodb.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "mongodb.secretName" -}}
{{- default (printf "%s-secrets" (include "mongodb.fullname" .)) .Values.auth.existingSecret }}
{{- end }}

{{- define "mongodb.secretStoreName" -}}
{{- default (printf "%s-secret-store" .Release.Namespace) .Values.externalSecrets.secretStoreName }}
{{- end }}

{{- define "mongodb.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "mongodb.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "mongodb.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "mongodb.labels" -}}
helm.sh/chart: {{ include "mongodb.chart" . }}
{{ include "mongodb.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{ include "mongodb.componentLabel" . }}
{{- end }}

{{- define "mongodb.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mongodb.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* Out of selectorLabels: that selector is immutable. "mongodb" matches the
component label the EC2 stack ships to Loki. */}}
{{- define "mongodb.componentLabel" -}}
app.kubernetes.io/component: mongodb
{{- end }}

{{/* Selector labels plus component, which log shippers read off the pod. */}}
{{- define "mongodb.podLabels" -}}
{{ include "mongodb.selectorLabels" . }}
{{ include "mongodb.componentLabel" . }}
{{- end }}

{{- define "mongodb.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{- if .Values.image.registry -}}
{{- printf "%s/%s:%s" .Values.image.registry .Values.image.repository $tag -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository $tag -}}
{{- end -}}
{{- end }}

{{- define "mongodb.createSecret" -}}
{{- if or .Values.auth.existingSecret .Values.externalSecrets.enabled -}}
false
{{- else -}}
true
{{- end -}}
{{- end }}
