# AWS Sprint 1 Runbook

This runbook turns the committed Terraform, CloudFormation, Docker, and Kubernetes assets into a deployable Sprint 1 stack in `ap-southeast-2`.

## 1. Provision infrastructure

Terraform path:

```bash
cd infra/terraform
terraform init
terraform apply
```

CloudFormation path:

```bash
aws cloudformation deploy \
  --stack-name aml-platform-sprint1 \
  --template-file infra/cloudformation/sprint1.yaml \
  --capabilities CAPABILITY_NAMED_IAM
```

## 2. Build and push the image

```bash
aws ecr get-login-password --region ap-southeast-2 | \
  docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.ap-southeast-2.amazonaws.com

docker build -t document-detection-engine:latest .
docker tag document-detection-engine:latest \
  <ACCOUNT_ID>.dkr.ecr.ap-southeast-2.amazonaws.com/aml-platform/document-detection-engine:latest
docker push \
  <ACCOUNT_ID>.dkr.ecr.ap-southeast-2.amazonaws.com/aml-platform/document-detection-engine:latest
```

## 3. Connect kubectl

```bash
aws eks update-kubeconfig \
  --region ap-southeast-2 \
  --name aml-platform-syd
kubectl apply -f k8s/base/
```

## 4. Verify the service

```bash
kubectl -n aml-platform get pods
kubectl -n aml-platform port-forward svc/document-detection-engine 8000:80
curl http://127.0.0.1:8000/healthz
curl http://127.0.0.1:8000/readyz
```

## 5. Exercise the analysis endpoint

```bash
curl -F "file=@invoice.pdf;type=application/pdf" \
  http://127.0.0.1:8000/api/v1/documents/analyze
```

## 6. Live storage validation

Set:

```bash
export STORAGE_BACKEND=s3
export STORAGE_BUCKET=aml-au-documents-sanitized
export STORAGE_PREFIX=sanitized
export KMS_KEY_ID=alias/aml-platform-documents
```

Then rerun the upload and confirm the response returns a `stored` sanitized object with a pre-signed URL.
