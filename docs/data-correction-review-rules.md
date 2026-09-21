# Quy tắc kiểm tra file góp ý dữ liệu

Áp dụng cho file JSON được xuất từ mục **Góp ý dữ liệu** của Nihongo Nin trước khi cập nhật `src/data`.

## Nguyên tắc bắt buộc

1. File export chỉ là danh sách đề xuất, không phải file import trực tiếp vào dữ liệu nguồn.
2. Không tự động ghi vào `src/data` chỉ vì JSON hợp lệ hoặc Gemini trả lời “đúng”.
3. Mỗi thay đổi phải qua kiểm tra deterministic trong repo, kiểm chứng bằng Gemini và đối chiếu nguồn tham khảo.
4. Gemini là một reviewer bắt buộc, không phải nguồn duy nhất. Kết luận không có bằng chứng phải được đánh dấu `needs-review`.
5. Chỉ xử lý entry có `status: "open"`. Không áp dụng lại entry đã có `status: "applied"`.
6. Không sửa các field ngoài phạm vi đề xuất nếu không có bằng chứng riêng cho từng field.

## 1. Kiểm tra file đầu vào

File hợp lệ phải có:

- `version` được hỗ trợ; hiện tại là `1`.
- `corrections` là mảng.
- Mỗi entry có `id`, `entityType`, `entityId`, `snapshot`, `issueType`, `suggestedValue`, `status`.
- `entityType` hiện chỉ hỗ trợ `vocab`.
- `issueType` thuộc một trong:
  - `add-new-vocab`
  - `wrong-meaning`
  - `additional-meaning`
  - `wrong-reading`
  - `wrong-example`
  - `other`

Từ chối hoặc yêu cầu sửa file nếu thiếu trường bắt buộc, sai version, trùng `id`, hoặc `suggestedValue` rỗng.

## 2. Đối chiếu dữ liệu hiện tại trước khi gọi Gemini

### Entry sửa từ có sẵn

- Tìm đúng `entityId` trong dữ liệu nguồn.
- So sánh `snapshot.word`, `snapshot.reading`, `snapshot.meaningVi` với dữ liệu hiện tại.
- Nếu dữ liệu nguồn đã thay đổi sau lúc export, đánh dấu `snapshot-drift`; không ghi đè tự động.
- Cập nhật file nguồn sở hữu entry, không sửa output đã merge trong `ALL_VOCAB`.

Ví dụ: `mimikara-n3-1` phải được sửa trong `src/data/vocab-tanoshii-mimikara-n3.json`.

### Entry thêm từ mới

Tìm trùng trong tất cả nguồn từ vựng trước khi thêm:

- Khớp chính xác `word + reading`.
- Khớp sau khi trim và chuẩn hóa Unicode NFKC.
- Katakana/hiragana tương đương khi phù hợp.
- Dạng từ điển và dạng biến đổi: ví dụ `バックして` phải được xét cùng `バックする`.
- Biến thể chính tả, có/không có okurigana, từ viết bằng kana và kanji.
- Kiểm tra cả bộ từ vựng JLPT và IT Book nếu từ có thể thuộc hai miền.

Nếu đã có cùng từ và cách đọc, ưu tiên bổ sung/sửa entry hiện tại thay vì tạo ID mới.

## 3. Kiểm chứng bắt buộc bằng Gemini

Gemini nhận dữ liệu sau cho từng entry:

- Từ, cách đọc, level người dùng đề xuất.
- Nghĩa hiện tại và nghĩa đề xuất.
- Loại góp ý.
- Ghi chú/ngữ cảnh của người dùng.
- Các entry gần khớp tìm được trong repo.
- Các câu thật tìm được trong đề thi, bài đọc, podcast hoặc dữ liệu học.
- Thông tin từ nguồn từ điển tham khảo đã thu thập.

Yêu cầu Gemini trả về JSON có cấu trúc, không nhận văn bản tự do:

```json
{
  "verdict": "accept | modify | reject | needs-review",
  "canonicalWord": "",
  "reading": "",
  "partOfSpeech": "",
  "level": "N5 | N4 | N3 | N2 | N1 | unknown",
  "meaningVi": "",
  "meaningNotes": "",
  "example": "",
  "exampleVi": "",
  "confidence": "high | medium | low",
  "warnings": [],
  "evidence": [
    {
      "source": "",
      "claim": ""
    }
  ]
}
```

Prompt cho Gemini phải yêu cầu:

- Xác định dạng từ điển chuẩn, không giữ nguyên một dạng chia chỉ vì người dùng nhập như vậy.
- Phân biệt nghĩa chính, nghĩa phụ, khẩu ngữ, nghĩa theo ngữ cảnh và nghĩa chuyên ngành.
- Không gán level JLPT chắc chắn nếu nguồn không xác nhận; dùng `unknown` hoặc confidence thấp.
- Không tạo ví dụ nếu không chắc collocation/cách dùng tự nhiên.
- Chỉ kết luận từ bằng chứng được cung cấp; không bịa URL hoặc tên nguồn.
- Nêu rõ nếu nghĩa Việt quá rộng, quá hẹp hoặc chỉ đúng khi đi với `する`.

## 4. Nguồn tham khảo tối thiểu

Một entry chỉ được tự động đề xuất `accept` khi có ít nhất hai tín hiệu độc lập:

1. Một nguồn từ điển/dataset có nguồn gốc rõ ràng, ưu tiên JMdict hoặc dữ liệu gốc đã lưu trong repo.
2. Một trong các nguồn sau:
   - Nguồn từ điển độc lập thứ hai.
   - Câu thật trong đề JLPT/bài đọc/podcast.
   - Entry hiện có trong repo thể hiện cùng cách dùng.

Gemini không được tính là nguồn tham khảo độc lập. Gemini chỉ tổng hợp và đánh giá các bằng chứng trên.

Nếu nguồn mâu thuẫn, level không chắc chắn, hoặc nghĩa phụ hiếm gặp, kết quả phải là `needs-review`.

## 5. Tìm liên kết liên quan

Mỗi từ mới hoặc từ được sửa cần tạo báo cáo liên kết, kể cả khi schema dữ liệu chưa lưu trực tiếp các liên kết này.

### Từ vựng liên quan

Tìm tối đa 10 entry có thật trong `ALL_VOCAB`:

- Từ đồng nghĩa/gần nghĩa và trái nghĩa.
- Từ cùng kanji hoặc cùng gốc từ.
- Cặp tự động từ/tha động từ.
- Từ ghép và collocation thường gặp.
- Dạng kính ngữ, khẩu ngữ hoặc biến thể chính tả đáng chú ý.

Mỗi kết quả phải lưu `id`, `word`, `reading`, `relation` và lý do ngắn. Không tạo liên kết tới từ chưa tồn tại.

### Ngữ pháp liên quan

- Tìm trong `ALL_BUNPO` các pattern thật sự xuất hiện hoặc cần để giải thích câu ví dụ đã xác minh.
- Chỉ lưu pattern/ID có thật trong app.
- Không gắn ngữ pháp chỉ vì cùng level hoặc có một chuỗi kana ngắn trùng nhau.
- Nếu không có liên hệ đủ mạnh, trả về mảng rỗng.

### Ngữ liệu liên quan

Tìm occurrence trong đề JLPT, bài đọc, bài nghe và podcast. Ưu tiên câu thể hiện đúng nghĩa đang xét, không chỉ khớp chuỗi ký tự.

Các liên kết trên được ghi trong báo cáo review. Chỉ thêm field mới vào dataset/app sau khi schema chính thức hỗ trợ.

## 6. Quyết định theo loại góp ý

### `additional-meaning`

- Giữ nghĩa hiện tại nếu nó vẫn đúng.
- Chỉ thêm nghĩa đề xuất nếu đó là nghĩa độc lập hoặc cách diễn đạt Việt hữu ích.
- Tránh thêm từ đồng nghĩa tiếng Việt không làm rõ thêm nội dung.
- Sắp nghĩa chính trước, nghĩa phụ/sắc thái sau.

### `wrong-meaning`

- Cần chỉ rõ nghĩa cũ sai ở điểm nào.
- Không xóa nghĩa cũ nếu nó vẫn đúng trong một ngữ cảnh phổ biến.
- Thay đổi lớn cần confidence cao và ít nhất hai bằng chứng độc lập.

### `wrong-reading`

- Xác nhận reading theo đúng nghĩa và từ loại của entry.
- Kiểm tra đa âm, tên riêng và biến thể rendaku trước khi sửa.

### `wrong-example`

- Kiểm tra ngữ pháp, độ tự nhiên, nghĩa và việc ví dụ có thật sự minh họa entry.
- `example` và `exampleVi` phải được sửa cùng nhau.

### `add-new-vocab`

Entry mới phải có tối thiểu:

- `id` duy nhất, ổn định.
- `word` ở dạng từ điển chuẩn.
- `reading` chuẩn.
- `level` đã xác minh hoặc được reviewer quyết định rõ.
- `partOfSpeech`.
- `meaningVi` ngắn gọn nhưng đủ phân biệt nghĩa.
- `hanViet` nếu áp dụng, nếu không dùng mảng rỗng.
- `mnemonic` là mảng; có thể rỗng.
- `example` và `exampleVi` đã được kiểm tra, hoặc cùng là `null`.
- Với động từ: kiểm tra `verbGroup`, `transitivity` và conjugation nếu schema nguồn yêu cầu.

Từ mới thông thường được thêm vào `src/data/vocab-tango-new.json`, trừ khi có nguồn chuyên biệt phù hợp hơn. Phải cập nhật `meta.counts` và ghi chú nguồn/thời điểm bổ sung.

## 7. Báo cáo review trước khi sửa source

Tạo file tạm `_scratch/data-correction-review-YYYY-MM-DD.json` với mỗi entry:

```json
{
  "correctionId": "",
  "verdict": "accept | modify | reject | needs-review",
  "reason": "",
  "normalizedProposal": {},
  "geminiReview": {},
  "sources": [],
  "relatedVocab": [],
  "relatedGrammar": [],
  "occurrences": [],
  "targetFile": "",
  "requiresHumanApproval": true
}
```

Không sửa `src/data` nếu còn entry `needs-review` mà chưa có quyết định của người review.

## 8. Kiểm tra sau khi áp dụng

- JSON parse được và không trùng ID.
- Không tạo duplicate `word + reading` ngoài trường hợp có chủ đích và được ghi chú.
- `npx tsc --noEmit` đạt.
- `npm run build:pages` đạt.
- Tra cứu tìm thấy từ/nghĩa mới.
- Link từ vựng/ngữ pháp liên quan chỉ tới ID tồn tại.
- Số lượng/meta của dataset đúng.
- So sánh diff để chắc chắn không có thay đổi ngoài các entry đã duyệt.
- Sau khi merge/release, người dùng có thể đánh dấu góp ý tương ứng là `applied` trong app.

## Ví dụ từ file export ngày 2026-09-21

### `男性` — đề xuất thêm “đàn ông”

- `nam giới` hiện tại vẫn đúng và trung tính.
- `đàn ông` có thể là cách diễn đạt bổ sung, nhưng không nên thay hoàn toàn nghĩa hiện tại.
- Kết quả dự kiến: `modify` thành một chuỗi rõ sắc thái, ví dụ `nam giới; đàn ông` nếu nguồn/ngữ cảnh xác nhận.

### `バック` — đề xuất “lùi lại”

- Repo có ngữ cảnh `バックして` với nghĩa lùi xe/lùi lại.
- Cần xác minh dạng từ điển nên là `バックする` hay entry danh từ `バック` với nhiều nghĩa khác.
- Không thêm trực tiếp `バック = lùi lại` trước khi phân biệt từ loại và các nghĩa phổ biến khác.
- Kết quả dự kiến: `needs-review` hoặc `modify`, không phải `accept` nguyên trạng.
