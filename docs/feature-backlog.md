# Feature backlog

Ghi chú các hướng phát triển để xem xét sau. Thứ tự ưu tiên có thể thay đổi
sau khi dùng thử các POC hiện tại.

## 1. Sổ câu sai dùng chung

- Lưu câu sai từ Quiz, luyện nghe và đề JLPT.
- Lọc theo loại nội dung, cấp độ và trạng thái đã/chưa sửa.
- Cho phép luyện lại trực tiếp từ sổ câu sai.
- Có thể xem một câu là đã sửa sau 1-2 lần trả lời đúng.
- Tác động: cao.
- Ước tính với Codex: 1-2 ngày.

## 2. Lịch sử tra cứu và danh sách yêu thích

- Hiển thị Kanji, từ vựng và ngữ pháp vừa tra.
- Cho phép ghim mục thường dùng.
- Có thể mở rộng thành các danh sách học cá nhân.
- Tác động: cao, đặc biệt với luồng Search.
- Ước tính với Codex: 0,5-1 ngày.

## 3. Cải thiện luyện nghe

- Thêm tua nhanh `-5s/+5s`.
- Lặp một đoạn A-B thay vì chỉ lặp toàn bộ audio.
- Thêm phím tắt và lưu tốc độ phát đã chọn.
- Tác động: trung bình-cao.
- Ước tính với Codex: 0,5-1 ngày.

## 4. Phân tích điểm yếu JLPT

- Thống kê điểm theo từ vựng, ngữ pháp, đọc hiểu và nghe hiểu.
- So sánh kết quả giữa các lần thi.
- Đưa câu sai từ đề thi vào sổ ôn tập.
- Tác động: cao.
- Ước tính với Codex: 1-2 ngày.

## 5. PWA và hỗ trợ offline

- Cài web như một ứng dụng trên điện thoại hoặc máy tính.
- Cache phần giao diện và dữ liệu học để dùng khi mất mạng.
- Tác động: trung bình; phù hợp định hướng web-first.
- Ước tính với Codex: 1-2 ngày.

## Ý tưởng đang xem xét: ghi nhận chỉnh sửa dữ liệu

Trong lúc học, người dùng có thể ghi lại nghĩa sai, nghĩa bổ sung hoặc ghi chú
cho Kanji, từ vựng và ngữ pháp. Các thay đổi được lưu riêng trong local
storage, không sửa trực tiếp dataset đóng gói. Có màn hình tập trung để xem,
sửa, xoá và xuất JSON phục vụ cập nhật lại `src/data`.
