# Hướng dẫn rà soát đề JLPT

Dùng tài liệu này khi rà soát hoặc bổ sung mọi đề JLPT đang có trong repo. Dataset đề thi chính hiện được đăng ký ở `src/popup/dethiCatalog.ts`; các bộ dữ liệu liên quan còn có quizbook và đề nghe, được đăng ký trong `src/popup/quizBookState.ts` và `src/popup/listeningState.ts`. Luyện đọc JLPT dùng adapter `src/lib/jlptReading.ts` từ chính dữ liệu đề, không có bản sao JSON riêng. Hãy kiểm tra các file đăng ký hiện tại trước khi lập phạm vi, vì dữ liệu trong `src/data` có thể chưa được đưa vào giao diện.

## 1. Lập danh sách và xác định nguồn

### Nguồn chung cho Đọc hiểu đề thi và Luyện đọc JLPT

- Sửa nội dung ở `src/data/dethi-n{level}-cac-nam.json`; đăng ký dataset mới trong `src/popup/dethiCatalog.ts`. Bộ chuyển đổi `src/lib/jlptReading.ts` tự lấy bài và các câu hỏi liên quan cho Luyện đọc, không sinh bản sao JSON.
- Giữ nguyên số câu, thứ tự lựa chọn và đáp án. Giữ layout hai màn hình; bản dịch/furigana/tham khảo trong đề thi vẫn chỉ hiện khi xem lại.
- Nếu bài có `readingPresentation`, kiểm tra bản dịch theo nhóm câu của Luyện đọc sau mỗi lần đổi bài hoặc furigana. Không cập nhật `bodySignature` để bỏ qua lỗi nếu chưa kiểm tra nghĩa và thứ tự. Bản dịch trong đề dùng `passageSentencesVi`, với ranh giới đơn vị riêng của màn hình đề.
- Chạy `npm run reading:extract-jlpt`, `npm run reading:test-jlpt` và build. Mở cùng bài ở Luyện đọc và lịch sử đề: kiểm tra đoạn/câu, dịch, furigana, tab tham khảo và nút trước/sau; lúc làm đề không được lộ hỗ trợ.
- Lần chuyển nguồn hiện tại đã đối chiếu 155 bài / 334 câu và giữ nguyên ID. ID cũ phụ thuộc hash của đoạn văn: nếu sửa tiếng Nhật làm đổi ID ở lần sau, phải cân nhắc chuyển tiến độ/bookmark; không coi test adapter là xác nhận nội dung đầy đủ theo PDF.

- Lập inventory từ các import/registry ở ba file state trên và mọi nơi khác đang nạp dataset JLPT. Ghi đường dẫn JSON, ID đề, cấp độ, kỳ thi, phần thi và trạng thái (đang hiển thị, ẩn tạm, hoặc chỉ là dữ liệu trích xuất).
- Phạm vi khởi đầu đã thấy trong repo: `src/data/dethi-n1-cac-nam.json`, `dethi-n3-cac-nam.json`, `dethi-n3-imo-26bo.json`, `quizbook-dethi-n3-2023-12.json`, `quizbook-dethi-n3-2025-12.json` và `listening-dethi-2025-12.json`. Xác nhận lại danh sách bằng registry trước mỗi đợt audit; không kết luận một file là “đã dùng” chỉ vì nó tồn tại.
- Đối chiếu với PDF/trang scan gốc trong `assets/data/de-thi/`, `assets/data/de-thi-cac-nam/` hoặc thư mục nguồn cụ thể của sách. Ảnh/trang cắt và ghi chú trích xuất tạm có thể nằm trong `_scratch/` hoặc `assets/data/de-thi-new/`. Xác định đúng kỳ thi, ấn bản và số trang trước khi so sánh; không lấy bản OCR hay JSON đã trích làm nguồn chuẩn.
- Ghi rõ PDF không có, trang mờ/thiếu hoặc chỉ có đáp án tham khảo. Các trường hợp không thể xác minh cần giữ trạng thái `needs-review`, không tự suy đoán từ câu lân cận.

## 2. So sánh toàn bộ đề với PDF

Kiểm tra từng phần và từng câu theo thứ tự trang, không lấy mẫu. Đánh dấu từng trang và từng số câu đã đối chiếu để phát hiện cả câu bị bỏ hẳn.

- So khớp tiêu đề phần, nhóm 問題, số câu, thứ tự, nội dung prompt, dấu câu, gạch chân/đánh dấu, đủ mọi lựa chọn và thứ tự lựa chọn. Kiểm tra ký tự gần giống như ー/−, dấu ngoặc, dấu ★, dấu chỗ trống và chữ nhỏ trong ảnh.
- So sánh `correctIndex` với trang đáp án chính thức tương ứng và kiểm tra lại trên nội dung câu. Xác minh mapping 0-based của app: option đầu là `0`, option thứ tư là `3`. Với nguồn có đáp án tham khảo hoặc đáp án không rõ, ghi tên nguồn và độ chắc chắn; không lặng lẽ chọn một đáp án.
- Giữ nguyên bài đọc dùng chung cho các câu trong cùng nhóm. Lưu passage đầy đủ ở câu đầu tiên; nếu JSON dùng `（上記と同じ）`/`（同上）`, xác nhận resolver hiển thị đúng đoạn nguồn trước đó trong cùng `problemGroup`. Không thay passage hoàn chỉnh bằng tiêu đề, trích đoạn, dấu ba chấm hoặc nội dung “(đồng dạng)”.
- Với bài đọc có đánh số chỗ trống, kiểm tra mọi số và vị trí trong passage với PDF. Khi mở câu hỏi, chỉ marker của câu đang xem được nhấn đậm trong passage tiếng Nhật và bản dịch tiếng Việt. Bản dịch phải giữ marker tại vị trí tương ứng, không điền đáp án vào chỗ trống.
- Kiểm tra mọi trang thuộc câu hỏi, kể cả trang bảng, tờ rơi, hình minh họa, lựa chọn bằng hình và trang tiếp nối. Gộp trang bổ sung vào đúng passage/câu; ghi rõ mọi trang nguồn chưa đưa vào dữ liệu hoặc hình ảnh chưa có asset.
- Kiểm tra câu prompt được đánh số theo số in trên đề (`number`), không dùng vị trí phần tử của mảng làm số hiển thị. Số cần nhất quán giữa câu, thanh điều hướng, kết quả và lịch sử.

### Bằng chứng bắt buộc khi rà toàn bộ 読解

Lập danh sách **bài đọc gốc trước**, từ PDF, rồi ánh xạ tất cả câu hỏi dùng mỗi bài sang JSON. Mỗi hàng báo cáo cần có: ID đề; `problemGroup` và số câu; trang PDF vật lý (và số trang in nếu có); câu/dòng đầu và cuối của bài gốc; câu/dòng đầu và cuối của passage app; phần tiêu đề, lời dẫn, đoạn văn, bảng/danh sách, chú thích hoặc trang nối bị thiếu/sai; và đường dẫn JSON/câu liên quan. Với bảng, lịch, quảng cáo và email, kiểm tra cả điều kiện, mức phí, thời gian, chữ ký và thông tin liên hệ nếu chúng có trong nguồn.

Đánh giá riêng hai cột: `đủ toàn văn nguồn?` và `đủ dữ kiện để trả lời?`. Cột thứ hai phải có kết luận theo **từng số câu**, dựa trên đúng passage, prompt và lựa chọn hiện ra khi làm bài; ghi dữ kiện cần dùng và vị trí của nó trong app. Một đoạn trích có thể đủ để chọn đáp án nhưng vẫn thiếu toàn văn nguồn. Ngược lại, đủ chữ nhưng thiếu bảng/hình hoặc đánh dấu câu hỏi vẫn có thể làm câu không giải được. Câu không tìm được trong PDF hoặc trang mờ phải để `chưa xác minh`.

Đối chiếu cả số **nhóm bài gốc** và toàn bộ số câu, không chỉ số câu trong JSON: model có thể gộp nhầm hai nhóm hoặc bỏ một nhóm mà vẫn bao phủ đủ số câu. Kết luận tự động kiểu “mọi bài đều đầy đủ” không phải bằng chứng; kiểm tra các anchor đầu/cuối và ít nhất các phần bị nghi thiếu trên ảnh trang PDF. Nếu kiểm tra giao diện bằng Playwright, ảnh chụp giúp xác nhận phần app hiển thị đúng dữ liệu sau khi resolver bài chung chạy, nhưng PDF vẫn là chuẩn nội dung và cấu trúc.

## 3. Bản dịch, lời giải và định dạng học

- Với câu đọc hiểu, cung cấp bản dịch đầy đủ của passage, prompt từng câu và từng lựa chọn. `optionsVi` phải cùng số phần tử, cùng thứ tự với `options`; không bỏ lựa chọn, nhập hai lựa chọn thành một hoặc làm phương án sai thành đúng. Dịch giữ tên riêng, số liệu, ngày giờ, đơn vị, tiêu đề và xuống dòng có ý nghĩa.
- Chỉ lưu một bản dịch passage cho nhóm câu dùng chung nếu schema quy định như vậy; xác nhận giao diện lấy được bản dịch đó cho mọi câu trong nhóm. Marker bản dịch phải khớp marker gốc và được nhấn đậm theo đúng câu đang xem.
- Prompt và bản dịch câu hỏi phải giữ nguyên các slot/ô trống, ký hiệu và số câu. Với câu không có câu prompt riêng (ví dụ từ được kiểm tra trong lựa chọn), không bịa prompt tiếng Việt thay thế.
- Mỗi câu cần giải thích ngắn gọn vì sao đáp án đúng phù hợp với ngữ cảnh. Với câu ngữ pháp chọn mẫu, nêu cách ghép/thể và nghĩa hoặc sắc thái của mẫu. Giải thích phương án đúng không thay thế giải thích distractor: khi có `optionExplanations`, cần đủ một mục cho từng lựa chọn, chỉ rõ vì sao từng mẫu đúng/sai trong chính câu này. Không dùng lời giải chung chung kiểu “không tự nhiên”.
- Với câu sắp xếp hội thoại/câu, giữ xuống dòng theo từng người nói và thứ tự hội thoại như trên trang đề; không gộp tất cả thành một dòng. Bảo toàn vị trí ★/slot và xác minh vị trí phần được hỏi theo PDF.
- Furigana chỉ là trợ giúp ôn tập, không được làm sai chữ nguồn. Với `passageFurigana`, `questionFurigana` và `optionsFurigana`, kiểm tra các segment ghép lại đúng nguyên văn nguồn, mọi chữ Hán đều có reading theo ngữ cảnh và các đoạn kana/Latin/số/ký hiệu vẫn nguyên dạng. Passage dùng chung chỉ lưu furigana một lần cho cả nhóm.
- Với `questionFurigana` của câu ngữ pháp sắp xếp/đục lỗ, ghép segment và so sánh với nguyên prompt in trên đề; phải còn đủ mọi `（ ）`, `★`, xuống dòng hội thoại và dấu câu. Không được đưa các từ của đáp án vào prompt. Một JSON hợp lệ nhưng furigana đang hiển thị câu đã điền đáp án là lỗi nghiêm trọng vì làm lộ đáp án khi ôn.
- Nếu dùng Gemini để sinh furigana, chia passage dài ở ranh giới câu/đoạn, kiểm tra exact reconstruction và kanji coverage, rồi bổ sung riêng chữ còn thiếu theo vị trí trong ngữ cảnh. Không chấp nhận output chỉ vì JSON hợp lệ; không sửa chữ nguồn theo phán đoán của mô hình.
- Với passage có bảng/tờ thông báo, giữ cấu trúc hàng/cột rõ ràng và mở review để xác nhận bảng hiển thị thành bảng, không lộ dấu Markdown thô. Bản dịch phải giữ nội dung bảng, điều kiện và số liệu.
- Thử bật/tắt furigana, script, bản dịch và lựa chọn dịch; các điều khiển phải áp dụng đúng vùng nội dung, không làm mất định dạng hoặc marker.

## 4. Đề nghe và liên kết asset

- Xác minh `paper.id`, `paper.audioUrl`, `exam.listeningBook` và dữ liệu nghe được liên kết đúng kỳ thi/cấp độ. Mở asset thật và nghe đoạn đầu, giữa, cuối; đối chiếu thứ tự câu với timeline/audio start. Đề nghe gốc thường dùng một audio liên tục phát theo thứ tự, không gán nhầm track của sách hay kỳ thi khác.
- Mỗi câu cần đúng nhóm nhiệm vụ và hướng dẫn cách làm phù hợp với nguồn JLPT: hiểu yêu cầu, bắt ý chính, hiểu tổng quan, chọn ý/ứng đáp tức thời hoặc phản hồi phù hợp. Hướng dẫn phải giải thích nếu prompt/lựa chọn chỉ được nói trong audio hay nếu đề in hình thay vì chữ.
- Kiểm tra thoại theo người nói và xuống dòng, script/transcript so với audio, câu hỏi và phương án so với audio hoặc trang in. Ghi riêng đoạn transcript chưa xác minh; không biến phần đoán được thành lời thoại chắc chắn.
- Với hình hoặc lựa chọn bằng hình, kiểm tra `questionImage`/`optionsImage`/`optionCount` và đường dẫn asset. Mở ảnh để xác nhận đủ hình, đúng thứ tự và cùng câu. Mọi URL/path phải phân giải được qua `assetUrl()` theo convention của `src/types/dethi.ts` và `src/types/listening.ts`.

## 5. Kiểm tra luồng giao diện và lịch sử

Thử trên màn hình Đề thi JLPT với ít nhất một câu đại diện mỗi dạng, gồm câu có passage dùng chung, passage có blank, câu dịch/lời giải, câu nghe có audio và câu có hình nếu dataset có dạng đó.

- Làm bài, nộp bài, vào kết quả, chuyển câu trước/sau và mở từng câu bằng question navigator. Kiểm tra đáp án đã chọn, đáp án đúng, giải thích và trạng thái chưa trả lời khớp câu hiện tại.
- Từ chi tiết đề mở Lịch sử, chọn một lần làm cũ và xem lại câu; kiểm tra điều hướng ngược về lịch sử/đề, số câu, lựa chọn đã chọn và kết quả vẫn gắn đúng `examId`, `paperId`, thứ tự câu. Không chỉ xác minh lịch sử hiển thị tổng điểm.
- Ở chế độ nghe/ôn tập, xác minh audio gắn đúng đề và điều khiển phát/tua không đổi câu hay làm lệch mapping. Với audio nguyên đề, `audioStartSec` là mốc nhảy tham khảo; không được khiến player tự chia/ngắt bài thi.
- Khi đưa đề vào bộ Luyện nghe theo từng câu, mỗi câu phải có cả `audioStartSec` và `audioEndSec` đã đối chiếu với MP3/script; chỉ dùng chung MP3 gốc, không tạo file cắt rời. Kiểm tra các đoạn đúng thứ tự, không chồng lấn, kết thúc sau câu thoại/câu hỏi cuối cùng nhưng trước khoảng chờ dài, hướng dẫn của phần kế tiếp hoặc lời kết thúc đề. Nếu chỉ có mốc đầu thì player sẽ phát đến cuối MP3 và dữ liệu chưa hoàn chỉnh. Đối chiếu lại đáp án và lựa chọn của bộ Luyện nghe với đề gốc; mọi thay đổi khác đáp án PDF phải có xác nhận từ audio và ghi rõ trong giải thích.
- Bật/tắt furigana và bản dịch trong phần review; xác nhận passage, prompt, lựa chọn và marker đều hiện/ẩn nhất quán. Dữ liệu thiếu phải được ghi thành mục cần bổ sung, không đánh dấu pass chỉ vì giao diện vẫn render.

### Chuẩn hiển thị mới cho 読解 khi xem lại đáp án

Các tiện ích học thêm chỉ xuất hiện sau khi nộp bài hoặc mở một lần làm trong Lịch sử. Màn hình đang thi phải giữ đúng trải nghiệm làm đề giấy: không tự hiện bản dịch, furigana, từ vựng/ngữ pháp tham khảo hay giải thích trước khi nộp.

- Giữ bố cục passage gần nguồn PDF: tiêu đề, đoạn văn, hội thoại theo từng người nói, danh sách/thông báo và khoảng ngắt đoạn phải còn nguyên. Nếu dữ liệu dùng newline, không render toàn bộ thành một khối văn bản không phân đoạn.
- Hiển thị số in trên đề trước prompt để người học xác định đúng câu. Với câu hỏi đục lỗ, nhấn rõ marker tương ứng (ví dụ `(22)` hoặc `（22）`) trong passage gốc; không thay marker bằng đáp án.
- Đặt nút furigana và “Xem bản dịch”/“Ẩn bản dịch” cạnh nhau ở vùng điều khiển phía trên passage. Khi bật dịch, hiển thị bản dịch song song theo từng câu/dòng, ghép đúng đơn vị tiếng Nhật với tiếng Việt. Renderer có thể tự căn chỉnh khi số đơn vị nguồn và bản dịch khớp; nếu không khớp, bổ sung `passageSentencesVi` đúng 1:1 theo câu/tiêu đề/dòng danh sách hoặc bảng. Không để bài nhiều câu lặng lẽ rơi về một khối dịch không chia đoạn. Chạy `scripts/enrich-dethi-reading-sentence-translations.ts --dry-run` để tìm nhóm còn lệch, tạo bản dịch đã xác thực rồi chạy lại để xác nhận không còn mục thiếu.
- Bài đọc chung chỉ xuất hiện một lần trong `passage`; `question` và `questionVi` của từng câu chỉ chứa prompt và bản dịch prompt. Nếu convert cũ chép nguyên bài vào từng câu, tách prompt cuối ra; ở câu điền khuyết mà passage đã đánh số chỗ trống, để prompt trống còn tốt hơn lặp cả bài. Cắt lại `questionFurigana` đúng theo prompt sau khi tách.
- Tách phần review thành hai tab cùng tinh thần với Luyện đọc: tab câu hỏi hiện passage, prompt, lựa chọn, đáp án đã chọn/đúng và giải thích; tab tham khảo hiện từ vựng trọng tâm và ngữ pháp tìm thấy trong passage. Chỉ hiện tab tham khảo khi có dữ liệu tham khảo thực sự.
- Từ vựng/ngữ pháp tham khảo phải có thể mở tra cứu và làm nổi bật mục tương ứng trong passage. Khi quay lại, khôi phục đúng đề, lần làm và câu đang review.
- Ở lịch sử, cần có cả điều hướng câu trước/câu sau ngoài bộ chọn câu. Không làm các tab, lookup hay điều khiển ôn tập ảnh hưởng tiến trình của bài thi đang làm.

Đây là tiêu chí giao diện dùng chung cho mọi cấp độ và kỳ thi. Chỉ cần sửa schema/dữ liệu riêng khi passage, dịch, furigana hoặc tham khảo của một đề còn thiếu/sai; không tạo một luồng riêng cho từng kỳ thi nếu cùng một thành phần có thể xử lý.

## 6. Checklist hoàn tất và ghi bằng chứng

Mỗi đợt audit cần có báo cáo trong `_scratch/` hoặc đường dẫn review được người phụ trách chọn, với bảng theo dataset/đề/phần/câu. Ghi tối thiểu: file và ID ổn định; PDF cùng trang; câu/field đã kiểm; kết quả; sai lệch; quyết định sửa; người/ngày kiểm; asset/audio đã mở; ảnh chụp hoặc ghi chú bằng chứng. Mỗi mismatch phải trỏ được tới trang PDF và đường dẫn JSON/ID câu cụ thể. Không đánh dấu xong nếu còn trang/câu chưa kiểm hoặc mismatch chưa có quyết định.

- [ ] Registry và inventory bao quát mọi dataset JLPT hiện có, kể cả file đang ẩn hoặc chỉ nạp vào màn hình quizbook/listening.
- [ ] Mọi trang và mọi câu trong từng section đã được đối chiếu nguồn; đã ghi rõ PDF/trang thiếu.
- [ ] Số câu, prompt, lựa chọn, `correctIndex`, passage/blank, bản dịch và lời giải khớp nhau.
- [ ] Passage dùng chung được giữ nguyên và hiện cùng bản dịch cho mọi câu liên quan.
- [ ] Furigana passage/prompt/lựa chọn ghép lại khớp nguồn, đủ coverage kanji, và chỉ xuất hiện trong phần review sau khi nộp/lịch sử.
- [ ] Dịch 1:1 theo câu/dòng cho mọi bài đọc; nơi tự căn chỉnh thất bại có `passageSentencesVi` đúng số lượng và thứ tự.
- [ ] Audio, transcript, hình, script và các asset path mở được, đúng kỳ thi/câu.
- [ ] Đã đi hết luồng làm bài → nộp → xem review → mở lần làm từ Lịch sử và thử các toggle.
- [ ] JSON parse được; schema song song như `optionsVi`, `optionExplanations`, `optionsFurigana` đúng số lượng/thứ tự; ID không trùng.
- [ ] Chạy `npx tsc --noEmit` và `npm run build:pages`; ghi lệnh, ngày, kết quả và lỗi còn lại vào báo cáo.
- [ ] Xem diff để đảm bảo chỉ sửa dữ liệu/asset liên quan tới mismatch đã ghi nhận; cập nhật inventory nếu registry hoặc phạm vi dataset đổi.

Kiểm tra build chỉ xác nhận ứng dụng đóng gói được, không chứng minh dữ liệu khớp PDF. Bằng chứng hoàn tất phải bao gồm đối chiếu nguồn và lượt kiểm tra giao diện nêu trên.
