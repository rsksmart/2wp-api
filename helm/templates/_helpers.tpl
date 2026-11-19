{{- define "app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := include "app.name" . }}
{{- if .Values.envSuffix }}
{{- printf "%s-%s" $name .Values.envSuffix | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name }}
{{- end }}
{{- end }}
{{- end }}

{{- define "app.daemonFullname" -}}
{{- printf "%s-daemon" (include "app.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "app.configMapName" -}}
{{- printf "%s-config" (include "app.fullname" .) }}
{{- end }}

{{- define "app.secretName" -}}
{{- default (printf "%s-secrets" (include "app.fullname" .)) .Values.existingSecret }}
{{- end }}

{{- define "app.secretStoreName" -}}
{{- default (printf "%s-secret-store" .Release.Namespace) .Values.externalSecrets.secretStoreName }}
{{- end }}

{{- define "app.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "app.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Labels. Pass a dict: (dict "ctx" . "component" "api").
*/}}
{{- define "app.labels" -}}
helm.sh/chart: {{ include "app.chart" .ctx }}
{{ include "app.selectorLabels" . }}
{{- if .ctx.Chart.AppVersion }}
app.kubernetes.io/version: {{ .ctx.Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .ctx.Release.Service }}
app.kubernetes.io/part-of: {{ include "app.name" .ctx }}
{{- end }}

{{- define "app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "app.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
{{- if .component }}
app.kubernetes.io/component: {{ .component }}
{{- end }}
{{- end }}

{{/*
Image reference. Pass a dict: (dict "ctx" . "image" .Values.api.image).
*/}}
{{- define "app.image" -}}
{{- $tag := .image.tag | default .ctx.Values.image.tag | default .ctx.Chart.AppVersion -}}
{{- if .ctx.Values.image.registry -}}
{{- printf "%s/%s:%s" .ctx.Values.image.registry .image.repository $tag -}}
{{- else -}}
{{- printf "%s:%s" .image.repository $tag -}}
{{- end -}}
{{- end }}

{{- define "app.envFrom" -}}
- configMapRef:
    name: {{ include "app.configMapName" . }}
{{- if or .Values.externalSecrets.enabled .Values.existingSecret }}
- secretRef:
    name: {{ include "app.secretName" . }}
{{- end }}
{{- end }}

{{- define "app.alloy.fullname" -}}
{{- printf "%s-alloy" (include "app.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "app.alloy.serviceAccountName" -}}
{{- default (include "app.alloy.fullname" .) .Values.alloy.serviceAccount.name }}
{{- end }}

{{/*
Secret holding the Loki ingest URL; its basic-auth credentials never pass
through values or tofu.
*/}}
{{- define "app.alloy.secretName" -}}
{{- default (printf "%s-loki" (include "app.alloy.fullname" .)) .Values.alloy.loki.existingSecret }}
{{- end }}
