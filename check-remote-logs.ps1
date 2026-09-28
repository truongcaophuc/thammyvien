# Script kiểm tra log ứng dụng trên máy ảo qua SSH - Sửa lỗi định dạng CRLF
# Địa chỉ máy chủ: 10.120.80.44
$serverIp = "10.120.80.44"
$username = Read-Host "Nhập username SSH"
$appPath = "/opt/telesales-app"  # Điều chỉnh đường dẫn ứng dụng trên máy chủ nếu cần

Write-Host "`n=== Bắt đầu kiểm tra log trên server $serverIp ===" -ForegroundColor Cyan

# 1. Kiểm tra kết nối SSH cơ bản
Write-Host "`n1. Kiểm tra kết nối SSH..." -ForegroundColor Yellow
try {
    $testConnection = ssh $username@$serverIp "echo 'Kết nối SSH thành công!'"
    Write-Host "✅ $testConnection" -ForegroundColor Green
}
catch {
    Write-Host "❌ Lỗi kết nối SSH: $_" -ForegroundColor Red
    exit 1
}

# 2. Kiểm tra các process ứng dụng đang chạy
Write-Host "`n2. Kiểm tra các process ứng dụng..." -ForegroundColor Yellow
$cmd2 = @"
echo '--- Các process đang chạy (Docker) ---'
docker ps -a
echo '`n--- Kiểm tra service systemd (nếu có) ---'
systemctl list-units --type=service | grep -i 'telesale\|app'
"@
ssh $username@$serverIp $cmd2

# 3. Lấy log từ container Docker (phổ biến nhất trong môi trường deploy)
Write-Host "`n3. Kiểm tra log Docker containers..." -ForegroundColor Yellow
$cmd3 = @"
cd $appPath
echo '--- Docker compose logs gần nhất (20 dòng cuối) ---'
if [ -f docker-compose.yml ]; then
    docker-compose logs --tail=20
else
    echo 'Không tìm thấy docker-compose.yml, kiểm tra container riêng lẻ:'
    docker logs \$(docker ps -q -l) --tail=20
fi
"@
ssh $username@$serverIp $cmd3

# 4. Kiểm tra file log ứng dụng trong thư mục logs
Write-Host "`n4. Kiểm tra file log ứng dụng..." -ForegroundColor Yellow
$cmd4 = @"
echo '--- Nội dung các file log trong thư mục logs ---'
if [ -d '$appPath/logs' ]; then
    ls -la $appPath/logs/
    echo '`n--- Lỗi mới nhất trong log ---'
    grep -i 'error\|exception\|fail' $appPath/logs/*.log | tail -20
else
    echo 'Không tìm thấy thư mục logs, kiểm tra các vị trí phổ biến khác:'
    ls -la /var/log/ | grep -i 'telesale\|app\|dotnet'
fi
"@
ssh $username@$serverIp $cmd4

# 5. Kiểm tra các vấn đề phổ biến: kết nối database, CORS, port binding
Write-Host "`n5. Kiểm tra các cấu hình phổ biến..." -ForegroundColor Yellow
$cmd5 = @"
echo '--- Kiểm tra port đang lắng nghe ---'
ss -tulpn | grep -E ':(5000|5001|80|443|8080)'
echo '`n--- Kiểm tra file appsettings.json ---'
if [ -f '$appPath/appsettings.json' ]; then
    cat $appPath/appsettings.json | grep -E 'ConnectionStrings|AllowedHosts|Cors'
fi
"@
ssh $username@$serverIp $cmd5

# 6. Kiểm tra tài nguyên hệ thống
Write-Host "`n6. Kiểm tra tài nguyên hệ thống..." -ForegroundColor Yellow
$cmd6 = @"
echo '--- Sử dụng RAM/CPU ---'
top -bn1 | head -20
echo '`n--- Dung lượng disk ---'
df -h
"@
ssh $username@$serverIp $cmd6

Write-Host "`n=== Hoàn thành kiểm tra log! ===" -ForegroundColor Cyan
Write-Host "Nếu bạn thấy các lỗi cụ thể trong log, hãy copy và cung cấp để phân tích sâu hơn." -ForegroundColor White