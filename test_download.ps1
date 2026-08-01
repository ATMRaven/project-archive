$token = "nfc_uYE5pG6VkM3MyBmwXJyadUKWXzDjHBnJc25f"
$deployId = "6a5cf6f0c643475c97baa55e"
$headers = @{ Authorization = "Bearer $token" }

$res = Invoke-RestMethod -Uri "https://api.netlify.com/api/v1/deploys/$deployId/download" -Headers $headers
Write-Host "Got S3 URL successfully"

Invoke-WebRequest -Uri $res.url -OutFile "atmr-premium-qr_deploy.zip"
Write-Host "Downloaded zip file"

Expand-Archive -Path "atmr-premium-qr_deploy.zip" -DestinationPath "atmr_unzipped" -Force
Get-ChildItem "atmr_unzipped"
