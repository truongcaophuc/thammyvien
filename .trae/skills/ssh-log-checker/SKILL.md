---
name: "ssh-log-checker"
description: "Kết nối SSH vào máy ảo để kiểm tra log ứng dụng, chẩn đoán lỗi sau khi deploy. Invoke khi cần kiểm tra lỗi trên môi trường production/staging."
---

# SSH Log Checker

Skill này giúp kết nối SSH vào máy chủ để kiểm tra log ứng dụng, chẩn đoán các lỗi xảy ra sau khi deploy lên môi trường production/staging.

## Các chức năng chính:
1. Kết nối SSH đến máy chủ
2. Kiểm tra log ứng dụng (API, frontend, database)
3. Kiểm tra trạng thái các services (Docker, systemd)
4. Kiểm tra tài nguyên hệ thống (CPU, RAM, disk)
5. Phân tích các lỗi phổ biến sau khi deploy

## Cách sử dụng:
- Khi cần kiểm tra log trên máy chủ ảo, invoke skill này
- Cung cấp IP máy chủ, username, và đường dẫn ứng dụng
- Skill sẽ tự động thực hiện các bước kiểm tra cần thiết