# 2wp-api Helm chart

| Chart | Deploys |
|---|---|
| `helm/` (`2wp-api`) | API Deployment (`--appmode=API`) with NodePort Service, optional TargetGroupBinding / PDB / HPA; sync daemon Deployment (`--appmode=DAEMON`, always one replica); shared ConfigMap; ExternalSecret |
| `helm/charts/mongodb/` | Single-node MongoDB StatefulSet on EBS; the application user is created at first start |

The subchart is vendored under `charts/` and also installs on its own. Set
`mongodb.enabled=false` to use a database managed outside the cluster.

## Prerequisites

Provisioned by `environments/twowp-app/2wp-api/k8s/<env>` in iac-ng:

- EKS cluster with the AWS Load Balancer Controller, External Secrets Operator
  and EBS CSI driver (`gp3` StorageClass)
- the namespace and its `<namespace>-secret-store` SecretStore
- Parameter Store entries under `/<cluster>/<namespace>/` (`tofu output ssm_secret_paths`);
  every entry is seeded with `PLACEHOLDER` and must hold a real value before install
- an ALB target group (`tofu output loadbalancer`)

## Install (dev)

```sh
aws-vault exec iov-twowp-app -- aws eks update-kubeconfig --name twowp-api-dev --region us-east-1

helm dependency build ./helm
aws-vault exec iov-twowp-app -- \
  helm upgrade --install 2wp-api ./helm -n 2wp-api-dev -f ./helm/values-dev.yaml
```

Prefix the `kubectl` and `helm` commands below with `aws-vault exec iov-twowp-app --`,
or open a shell with `aws-vault exec iov-twowp-app` first.

Verify:

```sh
kubectl get externalsecret,pods,targetgroupbinding -n 2wp-api-dev
curl -s https://api.dev.2wp.rootstock.io/health | jq
```

## Logs

Workloads are labelled by component (`api`, `daemon`, `database`):

```sh
# API (follow, JSON lines)
kubectl logs -n 2wp-api-dev deploy/twowp-api-dev -f

# sync daemon
kubectl logs -n 2wp-api-dev deploy/twowp-api-dev-daemon -f

# MongoDB
kubectl logs -n 2wp-api-dev mongodb-0 -f

# everything in the release, prefixed by pod
kubectl logs -n 2wp-api-dev -l app.kubernetes.io/instance=2wp-api -f --prefix --max-log-requests 10

# only errors and warnings from the API and the daemon
kubectl logs -n 2wp-api-dev -l app.kubernetes.io/name=twowp-api -f --prefix \
  | grep -E '"level":"(error|warn)"'

# the previous container's log after a restart
kubectl logs -n 2wp-api-dev deploy/twowp-api-dev --previous
```

Readable output: pipe through `jq -r '[.timestamp,.level,.name,(.message // .errorMessage)] | @tsv'`.

Sync progress (the daemon writes one `syncstatuses` document per RSK block):

```sh
kubectl exec -n 2wp-api-dev mongodb-0 -- sh -c 'mongosh --quiet \
  -u "$MONGO_APP_USERNAME" -p "$MONGO_APP_PASSWORD" --authenticationDatabase rsk rsk \
  --eval "db.syncstatuses.find().sort({rskBlockHeight:-1}).limit(1).next().rskBlockHeight"'
```

Compare with `rskNode.lastRskBlockNumber` from `/health`.

## Configuration

`values.yaml` holds the defaults; `values-<env>.yaml` only what differs. The
`env` map is rendered into one ConfigMap for both workloads and should contain
exactly the variables the application reads. Passwords come from Parameter
Store through `externalSecrets.apiSecrets` (API) and
`mongodb.externalSecrets.secrets` (database); one missing parameter fails the
whole Secret and the pods with it.

Names: `nameOverride` defaults to `twowp-api` because Service names cannot
start with a digit; `envSuffix` is appended so several environments can share
a cluster. The MongoDB Service is always `mongodb`, so
`RSK_DB_CONNECTION_HOST` is the same in every environment.

## Operations

- **Password rotation**: the application user is created only on an empty
  volume. After changing `rsk-db-connection-password` in Parameter Store, also
  run `db.changeUserPassword()` in MongoDB.
- **Sync start block**: `SYNC_INITIAL_BLOCK_*` is read only on an empty
  database; changing it later has no effect until the sync-status collection
  is dropped.
- **Data**: the PVC outlives `helm uninstall`; delete
  `data-mongodb-0` by hand when the data is no longer wanted.
- **Rollouts**: the app handles SIGINT but not SIGTERM, so every pod waits out
  `terminationGracePeriodSeconds` on a rollout.
