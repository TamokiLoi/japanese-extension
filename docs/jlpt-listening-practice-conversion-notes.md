# Ghi chú mở rộng đề nghe JLPT vào Luyện nghe

Tài liệu này ghi lại cách đã áp dụng cho phần 聴解 đề JLPT N3 T12/2025 và checklist để đưa các đề nghe khác vào **Luyện nghe** dưới dạng từng câu. Đây là ghi chú triển khai và kiểm thử; không thay thế việc đối chiếu đề gốc, đáp án và audio của từng kỳ thi.

## Mẫu đã làm: N3 T12/2025

- Dataset: `src/data/listening-dethi-2025-12.json`; mỗi mục là một câu nghe và có `book: "dethi-2025-12"`.
- Toàn bộ phần nghe có 28 câu, theo cấu trúc riêng của đề này: 問題1 `kadai` 6 câu, 問題2 `point` 6, 問題3 `gaiyou` 3, 問題4 `hatsugen` 4, 問題5 `sokuji` 9.
- 28 file clip nằm dưới `public/audio-preview/N3-T12-2025/Q01.mp3` … `Q28.mp3`; các `audioUrl` trỏ thẳng tới clip tương ứng trên GitHub Pages. Không suy ra rằng các đề/kỳ thi khác cũng có 28 câu hay cùng phân bố.
- Đề nghe được tích hợp vào Luyện nghe qua `src/popup/listeningState.ts`: import dataset, thêm vào `ALL_LISTENING`, khai báo tên sách trong `BOOK_LABELS` và thứ tự trong `BOOK_ORDER`. Chỉ thêm file JSON hoặc trang preview riêng thì bộ đề chưa chắc xuất hiện trong bộ lọc.
- Câu có lựa chọn hình cần dùng `optionsImage` cùng `optionCount`; không OCR hoặc thay hình bằng lựa chọn chữ tự đoán. `correctIndex` là chỉ số 0-based.
- Với câu mà audio là nguồn duy nhất cho lựa chọn/script hoặc đáp án không có key in sẵn, ghi nguồn và mức độ kiểm chứng vào `notes`. Gemini có thể hỗ trợ nghe chép/transcribe hoặc đề xuất phân đoạn, nhưng không coi suy luận của Gemini là đáp án chính thức; cần kiểm tra lại với audio, đề và đáp án có thể tìm được.

## Quy trình áp dụng cho đề tiếp theo

### 1. Xác định nguồn và phạm vi

1. Chốt cấp độ, kỳ thi, phiên bản đề; tìm PDF/scan, đáp án và audio/script gốc trong `assets/data/` hoặc thư mục nguồn tương ứng.
2. Lập bảng số câu theo từng 問題 từ đề gốc. Không lấy số câu hoặc loại 問題 của N3 T12/2025 áp cho đề khác.
3. Ghi rõ phần nào có đáp án chính thức, phần nào phải nhận dạng từ audio, phần nào dùng lựa chọn bằng hình. Nếu nguồn thiếu/mờ thì đánh dấu cần rà soát, không tự lấp bằng câu gần kề.

### 2. Chuẩn bị clip theo câu

1. Dùng audio gốc làm chuẩn và xác định ranh giới từng câu theo thứ tự phát; giữ nội dung cần thiết để làm câu (hướng dẫn riêng của câu, hội thoại/độc thoại và phần câu hỏi nếu có). Không cắt mất từ mở đầu/cuối, câu trả lời hoặc thông tin phân biệt đáp án.
2. Đặt tên file nhất quán như `Q01.mp3`, `Q02.mp3`… trong thư mục riêng của kỳ thi, ví dụ `public/audio-preview/N3-T12-2025/`. Nếu audio là một file liên tục và không thể tách an toàn, cân nhắc giữ file gốc và dùng mốc phát theo schema/UI hỗ trợ thay vì tạo clip cắt sai.
3. Nghe kiểm tra các ranh giới và nội dung clip với audio gốc; tối thiểu kiểm tra câu đầu, cuối, các mốc chuyển 問題 và câu có đoạn rất ngắn/dễ cắt nhầm. Với dữ liệu dùng để phát hành, xác minh từng clip nếu điều kiện cho phép.
4. Kiểm tra URL/path từ ứng dụng thật. `assetUrl()` ở `src/platform/assetUrl.ts` xử lý URL tuyệt đối và path nội bộ khác nhau; chọn một quy ước nhất quán, không ghép thủ công sai base `/japanese-extension/`. Không coi trang preview tĩnh là thay thế cho việc đăng ký vào Luyện nghe.

### 3. Tạo dữ liệu từng câu

Theo `ListeningQuestion` trong `src/types/listening.ts`, mỗi câu cần dữ liệu phù hợp với dạng bài:

- ID ổn định, không trùng; cấp độ, `book`, `taskType`, `audioUrl` đúng kỳ thi và câu.
- `scenario`/`scenarioVi`, `turns`, `question`/`questionVi`, `options`/`optionsVi`, `correctIndex`, `explanation`. Trường không áp dụng được để rỗng theo schema hiện hành; không điền nội dung giả chỉ để tránh chuỗi rỗng.
- `optionsVi` giữ cùng số lượng và thứ tự với `options`. `correctIndex` bắt đầu từ 0; kiểm tra bằng đáp án gốc và nghe lại ngữ cảnh.
- Dùng đúng 5 nhóm `taskType`: `kadai`, `point`, `gaiyou`, `hatsugen`, `sokuji`. Không nhập nhằng `hatsugen` (biểu hiện lời nói, 問題4) với `sokuji` (phản xạ tức thời, 問題5).
- Nếu lựa chọn được in thành hình, giữ asset hình và khai báo `optionsImage`/`optionCount`; xác minh thứ tự số lựa chọn trên UI. Nếu nội dung chỉ được nói trong audio, không để lộ lựa chọn trước thời điểm phù hợp với luồng làm câu; kiểm tra hành vi trong `ListeningScreen.tsx`.
- Lời giải nên nêu tín hiệu nghe dẫn đến đáp án. Ghi trong `notes` nếu lựa chọn được chép từ audio hoặc đáp án còn thiếu nguồn chính thức, tránh trình bày suy luận chưa xác minh như dữ kiện chắc chắn.

### 4. Đăng ký vào Luyện nghe

Trong `src/popup/listeningState.ts`:

1. Import JSON mới và ép kiểu theo `ListeningDataset` như các bộ hiện hành.
2. Thêm câu hỏi vào `ALL_LISTENING`.
3. Thêm `book` vào `BOOK_LABELS` và `BOOK_ORDER`.
4. Kiểm tra `AVAILABLE_BOOKS`, `AVAILABLE_TASK_TYPES` và số lượng trên bộ lọc tự suy ra từ `ALL_LISTENING`; xác nhận sách có thể chọn độc lập và reset filter vẫn bao gồm nó.
5. Nếu mới convert một phần đề, ghi rõ trong tên sách/ghi chú đây là pilot (ví dụ `6/28 câu`) và không gọi đó là phần nghe đầy đủ.

### 5. Kiểm tra trước khi hoàn tất

- Dữ liệu: JSON parse được; ID không trùng; đủ số câu theo đề; mọi `taskType` đúng nhóm; mọi URL có file; `correctIndex` nằm trong phạm vi lựa chọn; `options` và `optionsVi` khớp số lượng; hình và `optionCount` đúng.
- Asset: kiểm tra file tồn tại và URL được phục vụ sau build/deploy (không chỉ tồn tại trên máy dev). Kiểm tra audio không rỗng, phát được và đúng câu; xác nhận thứ tự không lệch một câu.
- UI: chạy app local, vào **Luyện nghe**, bỏ các sách khác và chỉ chọn bộ đề mới; xác nhận tổng số câu, số theo dạng, audio phát/tạm dừng/seek, lựa chọn hình/chữ, trả lời, đáp án/giải thích và bản dịch hiện đúng.
- Bao phủ: thử ít nhất một câu mỗi `taskType`, câu đầu/cuối từng nhóm, câu có hình và câu dùng lựa chọn chỉ nghe được. Nếu có thể, rà đủ clip thay vì chỉ sample.
- Build: chạy `npm run build:pages`; ghi lại lỗi còn tồn tại độc lập với thay đổi. Build thành công chỉ chứng minh đóng gói, không chứng minh nội dung hay audio khớp đề.
- Deploy/PWA: sau khi publish, mở lại **Luyện nghe** trên web và PWA nếu cả hai được hỗ trợ; kiểm tra request audio và cache/version mới. Không kết luận tích hợp thành công chỉ vì URL preview mở được.

## Checklist nhanh

- [ ] Đã kiểm kê đủ số câu và từng 問題 từ đúng đề gốc.
- [ ] Mỗi câu có clip đúng, nghe kiểm tra được, thứ tự và điểm cắt không lệch.
- [ ] Đáp án có nguồn; suy luận/transcript máy hỗ trợ được ghi chú và rà lại.
- [ ] Đã kiểm tra lựa chọn hình, audio-only và mapping `correctIndex`.
- [ ] Dataset đã được import, đăng ký vào bộ lọc Luyện nghe và hiện đúng số câu.
- [ ] Đã thử thao tác học trong app local và kiểm tra build; sau deploy đã xác nhận asset/cache.
