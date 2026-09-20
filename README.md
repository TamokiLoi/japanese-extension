# Nihongo Nin

Ứng dụng web hỗ trợ người Việt tự học và ôn thi JLPT. Nội dung hiện tập trung
chủ yếu vào N3, đồng thời có dữ liệu Kanji và từ vựng cho nhiều cấp độ khác.

Repository vẫn còn bản Chrome/Edge extension (Manifest V3), nhưng hướng phát
triển chính từ hiện tại là **Web Dashboard**. Phần extension được xem là giao
diện legacy: có thể được thu gọn hoặc đóng gói lại sau khi các luồng web ổn
định, thay vì tiếp tục phát triển hai UI ngang hàng.

> **Chỉ dùng cá nhân — không phát hành công khai.** `meanings.vi` và
> `mnemonic` của 943/979 Kanji có nguồn từ một PDF flashcard cá nhân
> ("Hán tự Tanoshii") với tình trạng bản quyền chưa được xác minh. Xem thêm
> [README của japanese-data](../japanese-data/README.md#known-limitations--next-steps)
> trước khi cân nhắc phát hành lên web công khai hoặc các extension store.

## Tính năng hiện có

### Học và tra cứu

- Trang chủ tổng hợp tiến độ, streak, mục tiêu trong ngày và nội dung đang học
  dở.
- Tra cứu đồng thời Kanji, từ vựng và ngữ pháp; hỗ trợ tìm bằng chữ Nhật,
  romaji, cách đọc, Hán Việt và nghĩa tiếng Việt.
- Kanji: lọc theo JLPT, xem âm On/Kun, Hán Việt, bộ thủ, nghĩa, mnemonic và từ
  vựng liên quan.
- Từ vựng: nhiều bộ sách/nguồn dữ liệu, lọc theo cấp độ và nguồn, xem cách đọc,
  Hán Việt, nghĩa, ví dụ, chia động từ và liên kết sang Kanji/bài đọc/câu hỏi
  liên quan.
- Ngữ pháp: lọc theo cấp độ, nguồn và chương; hiển thị cấu trúc, cách dùng, ví
  dụ và liên kết sang bài đọc hoặc câu luyện đề có sử dụng mẫu đó.
- IT Book: từ vựng chuyên ngành, bài hội thoại, thuật ngữ, quiz và ảnh trang
  sách gốc trên bản web.

### Luyện tập

- Quiz Kanji, từ vựng, ngữ pháp và từ vựng IT với nhiều chiều hỏi khác nhau;
  hỗ trợ cả trắc nghiệm và nhập đáp án.
- Luyện đề theo các bộ sách, có bộ lọc, bảng điều hướng câu hỏi và lưu đáp án.
- Đề thi JLPT N3 theo từng kỳ và bộ đề mô phỏng: làm bài có giới hạn thời gian,
  lưu nhiều lần thi, xem lại và thống kê điểm cao nhất.
- Luyện đọc theo sách, độ dài và cấp độ; hỗ trợ furigana, bản dịch, ghi chú học
  và chấm từng câu hỏi.
- Luyện nghe theo sách và dạng câu hỏi, có audio player và lưu kết quả.
- Nghe chép chính tả, so sánh từng ký tự và tính độ chính xác.
- Podcast YouTube: lọc theo kênh/series/cấp độ, transcript đồng bộ thời gian,
  bản dịch, đánh dấu yêu thích và trạng thái đã nghe.
- Ghép cặp từ vựng theo nghĩa hoặc cách đọc, có thể lưu và tiếp tục nhiều phiên.
- Ôn tập các mục đã đến hạn bằng nhập đáp án hoặc tự đánh giá sau khi lật đáp
  án.

### Tiến độ và kế hoạch

- Trạng thái học dùng chung cho Kanji, từ vựng và ngữ pháp:
  `chưa học`, `đang học`, `đã thuộc`, `cần ôn lại`.
- Theo dõi streak riêng cho từng chiều câu hỏi. Một mục được xem là đã thuộc
  khi đạt đủ các chiều cần thiết, không chỉ một kiểu câu hỏi.
- Tự đánh dấu cần ôn lại sau nhiều lần trả lời sai và lên lịch ôn lại sau khi
  đã thuộc.
- Thống kê theo nội dung, cấp độ, nguồn, trạng thái và dạng câu hỏi.
- Mục tiêu học hằng ngày và lộ trình N3 dựa trên ngày thi dự kiến.
- Sao lưu/khôi phục tiến độ và cài đặt bằng file JSON.

## Web và extension

| Phạm vi | Web Dashboard | Chrome/Edge extension |
| --- | --- | --- |
| Vai trò | Sản phẩm chính | Legacy/tiện ích bổ sung |
| Giao diện | Responsive, sidebar và mobile navigation | Popup cố định, có thể mở một số màn hình ra tab |
| Tính năng | Đầy đủ các nhóm tính năng ở trên | Chủ yếu Kanji, từ vựng, ngữ pháp, đọc, luyện đề, quiz, tìm kiếm và thống kê |
| Lưu trữ | `localStorage` của website | `chrome.storage.local` |
| Nhắc học nền | Không | Có alarm, notification và badge streak |

Hai bản dùng chung dataset, type và phần lớn logic state. Các tính năng web
mới không nhất thiết phải tiếp tục được port ngược về popup extension.

## Kiến trúc

```text
src/
├── web/          Web Dashboard, router và các screen responsive
├── popup/        UI extension legacy và các module state dùng chung
├── platform/     Adapter cho storage, asset URL, runtime và mở tab
├── background/   Service worker MV3: reminder, notification, badge, quiz tab
├── types/        Kiểu dữ liệu cho các bộ nội dung
└── data/         Dataset JSON được đóng gói cùng ứng dụng
```

Entry point chung là `src/popup/main.tsx`:

- build web nạp `src/web/WebApp.tsx`;
- build extension nạp `src/popup/App.tsx`;
- `src/platform/storage.ts` giữ cùng một API state cho cả
  `localStorage` và `chrome.storage.local`.

Các file `src/popup/*State.ts` hiện đóng vai trò domain/data layer dùng chung,
không chỉ dành riêng cho popup. Khi tái cấu trúc web-first, nhóm này có thể
được đổi tên hoặc chuyển sang thư mục trung lập mà không thay đổi hành vi.

## Cài đặt

Yêu cầu Node.js phiên bản hỗ trợ `--experimental-strip-types` cho các script
dữ liệu.

```bash
npm install
```

Dataset trong `src/data` đã được commit để repository có thể build độc lập.
Chỉ chạy đồng bộ khi dữ liệu ở repository `japanese-data` bên cạnh đã thay
đổi:

```bash
npm run data:sync
```

## Chạy Web Dashboard

Tạo `.env.local` từ `.env.example` và điền OAuth Client ID nếu muốn thử sao
lưu Google Drive:

```bash
VITE_GOOGLE_CLIENT_ID=000000000000-example.apps.googleusercontent.com
```

Client ID là cấu hình công khai của ứng dụng web. Không đưa OAuth client
secret vào frontend hoặc biến `VITE_*`.

Chạy development server ở chế độ web:

```bash
npm run dev
```

`npm run dev` là web mode mặc định. Nếu cần chạy lại extension legacy bằng
Vite/CRXJS, dùng `npm run dev:extension`.

Build và preview bản web:

```bash
npm run build:pages
npm run preview:pages
```

Output được tạo tại `dist-pages/`. Vite dùng base path
`/japanese-extension/` cho GitHub Pages. Direct link được khôi phục qua
`public/404.html` và History API router trong `WebApp.tsx`.

GitHub Pages build đọc Client ID từ repository variable
`GOOGLE_CLIENT_ID` trong workflow deploy.

## Build extension legacy

```bash
npm run build
```

Output được tạo tại `dist/`. Để chạy thủ công:

1. Mở `chrome://extensions` hoặc `edge://extensions`.
2. Bật Developer mode.
3. Chọn **Load unpacked** và trỏ tới thư mục `dist/`.

Ảnh trang IT Book không được đưa vào extension build để tránh tăng package
khoảng 26 MB. Extension dùng Manifest V3 với các quyền `storage`, `alarms`,
`notifications` và `tabs`.

## Các script dữ liệu

```bash
npm run podcast:fetch
npm run podcast:transcript:fetch
npm run podcast:transcript:translate
npm run podcast:categorize
npm run podcast:transcript:level
npm run icons:generate
```

Các script podcast dùng để cập nhật metadata, transcript, bản dịch và phân
loại cấp độ. Không cần chạy chúng cho một build thông thường.

## Lưu ý hiện tại

- Nội dung và UI chủ yếu dùng tiếng Việt.
- Một số dataset mới chỉ có N3 dù schema đã hỗ trợ N5–N1.
- 36 Kanji chưa có nghĩa tiếng Việt đã xác minh và đang dùng `viDraft` do AI
  tạo; UI hiển thị chúng là nội dung nháp.
- Dữ liệu học nằm hoàn toàn trên trình duyệt; chưa có tài khoản hoặc đồng bộ
  cloud.
- Backup dùng danh sách storage key cho phép được khai báo thủ công trong
  `src/popup/backupState.ts`; thêm state mới phải cập nhật danh sách này.
- Tính năng luyện dịch đang ở trạng thái thử nghiệm và chưa được nối vào
  navigation chính.
- Floating AI chat đã có code thử nghiệm nhưng hiện đang tắt trong web shell.
- Trước khi deploy công khai cần xử lý nguồn dữ liệu Kanji nêu ở đầu README.

## Định hướng gần nhất

1. Giữ Web Dashboard là giao diện chính và hoàn thiện trải nghiệm responsive.
2. Di chuyển logic dùng chung ra khỏi namespace `popup` để phản ánh đúng vai
   trò domain layer.
3. Quyết định phạm vi extension tối thiểu: bỏ hẳn, chỉ giữ reminder/quick lookup,
   hoặc đóng gói web app thành một tab extension nhẹ.
4. Sau khi chốt phạm vi, loại bỏ UI trùng lặp và đơn giản hóa cấu hình build.
