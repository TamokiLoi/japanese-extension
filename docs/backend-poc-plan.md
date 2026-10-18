# Kế hoạch POC backend và chuyển hạ tầng

Ngày ghi nhận: 2026-10-17.

Trạng thái: lưu đề xuất để xem lại; chưa triển khai POC, tạo tài khoản, đổi visibility repo hoặc mua VPS. Các hạn mức dịch vụ cần kiểm tra lại khi triển khai.

## Mục tiêu

- Thử backend cấp nội dung theo quyền và theo nhu cầu, giảm khả năng tải hàng loạt kho dữ liệu.
- Đánh giá đăng nhập, tra cứu, Kanji Map, bài nghe và trải nghiệm PWA trước khi đầu tư VPS.
- Viết backend có thể chuyển từ Vercel sang VPS với ít thay đổi.
- Người dùng vẫn có thể lưu nội dung đã được cấp xuống trình duyệt; POC không đặt mục tiêu ngăn sao chép tuyệt đối.

## Kiến trúc POC được đề xuất

```text
Repo FE phát triển chính
    │ push nhánh POC
    ▼
GitHub Actions đồng bộ một chiều, nếu cần tài khoản triển khai khác
    ▼
Repo FE triển khai → Vercel project FE: React/Vite/PWA
                                  │ API
                                  ▼
Repo BE private → Vercel project BE: NestJS/TypeScript
                                  │ transaction pooler
                                  ▼
                          Supabase PostgreSQL

Ảnh/audio thử nghiệm → private file storage → cấp quyền qua backend
```

- Giữ giao diện React/PWA hiện tại, thêm lớp gọi API cho từng tính năng được chuyển.
- FE và BE dùng hai Vercel project độc lập để cấu hình, xem log và deploy riêng. Backend được đề xuất có repo riêng.
- NestJS là lựa chọn ưu tiên cho POC và bản chạy VPS. Chưa cần đổi ngôn ngữ vì mục tiêu bảo mật; hiệu quả phụ thuộc thiết kế và triển khai quyền truy cập.
- PostgreSQL là database ưu tiên. Dùng bảng quan hệ cho tài khoản, tiến độ, Kanji, từ vựng và liên kết; dùng JSONB cho nội dung linh hoạt khi phù hợp.
- ORM: chọn Prisma hoặc Drizzle lúc triển khai; chưa chốt.
- Supabase Free hiện cung cấp 500 MB database. Đo dung lượng sau import và tạo index trước khi quyết định chuyển toàn bộ dữ liệu.
- Kết nối backend serverless qua Supabase transaction pooler, cấu hình driver/ORM phù hợp và giới hạn connection pool.
- Cân nhắc Supabase Auth cho đăng nhập để tận dụng hạ tầng sẵn có; đây là lựa chọn đề xuất, chưa chốt.

## Tài khoản GitHub/Vercel và đồng bộ

Ý tưởng của người dùng: trong lúc tài khoản Vercel hiện tại đang chờ xét duyệt, dùng tài khoản GitHub/Vercel khác để thử POC và tự đồng bộ từ repo đang phát triển.

1. Kiểm tra khả năng cấp quyền cho Vercel truy cập repo hiện tại trước khi tạo thêm bản sao.
2. Nếu cần repo ở tài khoản khác, ưu tiên repository độc lập private cho hướng lâu dài. Fork của repo public vẫn public và không đổi riêng thành private được.
3. GitHub Actions đồng bộ một chiều đúng nhánh triển khai; repo nhận chỉ dùng deploy, tránh chỉnh sửa ở cả hai nơi. Không mặc định đồng bộ mọi branch/tag hoặc xóa refs.
4. Credential ghi repo đích đặt trong Actions Secrets, giới hạn quyền và phạm vi repo. Không đưa token vào source hoặc log.
5. Kiểm tra điều kiện quyền truy cập/tác giả commit của Vercel với loại repo và gói thực tế. Đồng bộ thành công chưa có nghĩa auto deployment đã thành công.
6. Email đăng nhập, email tác giả commit và quyền sở hữu repo là các thông tin riêng; không cần đưa Gmail vào source và không tự sửa danh tính commit để xử lý quyền deploy.
7. Tài khoản mới vẫn có thể cần xác minh; chưa coi việc đổi email là giải pháp chắc chắn cho trạng thái xét duyệt.

## Phạm vi POC đề xuất

Chuyển một lát cắt hoàn chỉnh trước, chưa chuyển toàn bộ app cùng lúc:

- Đăng nhập và xác thực phiên.
- Một tập Kanji/từ vựng để thử tra cứu, phân trang và chi tiết thẻ.
- Kanji Map trả cấu tạo và các chữ liên quan đến chữ đang chọn.
- Một bài nghe cùng ảnh/audio thử nghiệm có kiểm soát truy cập.
- Tiến độ học trên server và cache giới hạn theo phần đang học trên PWA.

Số lượng mẫu sẽ chốt khi bắt đầu POC. Đảm bảo các mẫu đủ để thử quan hệ Kanji, tìm kiếm tiếng Nhật/Hán Việt/nghĩa và thao tác trên mobile.

## Thiết kế bảo vệ dữ liệu

- Xác thực và kiểm tra quyền ở backend cho các API nội dung được bảo vệ.
- Tiến độ gắn với danh tính xác thực; không tin user ID do client tự gửi.
- Tìm kiếm/lọc trên server; giới hạn page size và trường dữ liệu trả về. Chỉ bỏ dataset khỏi frontend khi tính năng tương ứng đã chuyển đầy đủ, gồm tra cứu, quiz và các nơi dùng chung dữ liệu.
- Giữ đáp án đúng trên server tới thời điểm chấm đối với luồng thi cần bảo vệ đáp án.
- Hạn chế tải hàng loạt theo tài khoản, IP và số nội dung khác nhau được truy cập; theo dõi hành vi quét tuần tự. Đặt giới hạn phù hợp với việc học bình thường.
- Trên Vercel, trạng thái rate limit cần dùng chung hoặc có lớp bảo vệ nền tảng; bộ đếm chỉ trong RAM một instance không đủ kiểm soát toàn bộ truy cập.
- Validate đầu vào, dùng truy vấn có tham số, cập nhật bản vá và tránh ghi thông tin nhạy cảm vào log.
- Database credentials và khóa quản trị Supabase chỉ ở backend. Quyền database/RLS phải phù hợp với đường truy cập thực tế; không mở đường đọc toàn bộ nội dung trực tiếp từ frontend.
- CORS và chặn F12 không thay thế xác thực/phân quyền.
- Ảnh/audio bảo vệ nằm trong private storage; backend kiểm tra quyền trước khi cấp file/URL có thời hạn. Nội dung đã được cấp vẫn có thể được người nhận lưu lại.
- PostgreSQL lưu metadata và tham chiếu file; ảnh/audio lưu trong file storage.
- Cache offline theo bài hoặc nhóm từ đang học. Tải toàn bộ kho offline đồng nghĩa cấp toàn bộ kho cho thiết bị.

## Tiêu chí POC đạt yêu cầu

- Push nhánh POC ở repo chính kích hoạt đúng chuỗi đồng bộ và deploy; FE/BE truy cập được bản tương ứng.
- Tính năng đã chuyển lấy dữ liệu qua API; bundle frontend không còn chứa toàn bộ dataset của tính năng đó.
- Request không có quyền bị từ chối; tài khoản không đọc/ghi được tiến độ của tài khoản khác.
- Phân trang, giới hạn truy cập và cơ chế chống tải hàng loạt hoạt động qua nhiều instance.
- Tìm kiếm, Kanji Map, phát/tua audio và thao tác thẻ hoạt động trên PC và PWA mobile.
- Kết nối database ổn định; đo dung lượng, thời gian phản hồi, cold start và mức sử dụng hạn mức miễn phí.
- Offline/cache và cập nhật PWA có hành vi rõ ràng. Có luồng sao lưu/khôi phục tiến độ khi chuyển origin/domain.
- Chuẩn bị cách quay lại phiên bản hiện tại nếu POC gặp vấn đề.

## GitHub Pages, Releases và repo private

- GitHub Pages và GitHub Releases là hai dịch vụ riêng. Tắt Pages không tự tắt link audio Releases của repo public.
- App hiện có audio trỏ trực tiếp đến GitHub Releases. Đổi repo private sẽ làm người dùng không có quyền GitHub mất khả năng tải trực tiếp qua các link đó.
- Có thể giữ audio public hiện tại cho các luồng chưa chuyển trong POC; mẫu dùng đánh giá bảo vệ media phải chuyển sang private storage. Chưa được kết luận toàn bộ audio đã được bảo vệ khi link Releases vẫn public.
- Trước khi đổi repo chính private: sao lưu release assets, chuyển audio cần dùng, cập nhật đường dẫn và kiểm tra bản triển khai mới.
- Repo private bảo vệ quyền truy cập source; JSON còn được import vào bundle frontend vẫn được gửi xuống trình duyệt.
- Dữ liệu hoặc lịch sử repo từng được tải/clone công khai có thể còn tồn tại bên ngoài sau khi repo đổi private.

## Phương án VPS sau POC

Nếu POC đáp ứng nhu cầu và muốn vận hành nhiều app:

- VPS DigitalOcean hoặc nhà cung cấp tương đương; cấu hình khởi đầu được gợi ý khoảng 2 GB RAM. DigitalOcean Basic hiện có gói 1 vCPU / 2 GB RAM / 50 GB SSD giá 12 USD/tháng; backup, thuế và dịch vụ khác tính riêng.
- Docker Compose triển khai NestJS, PostgreSQL và Caddy/Nginx. GitHub Actions build trên CI rồi deploy lên VPS.
- Có thể chạy FE, BE và PostgreSQL chung VPS lúc đầu; mỗi app có container, database và database user riêng. Khả năng chạy nhiều app phụ thuộc tải và tài nguyên thực tế.
- Dùng domain/subdomain cho từng app và HTTPS. Domain mua khi triển khai chính thức; POC có thể dùng địa chỉ Vercel.
- Sao lưu database ra nơi ngoài VPS. Khi cần, tách database hoặc media sang dịch vụ riêng.
- Đổi connection string và cấu hình triển khai để chuyển NestJS từ Vercel sang VPS; rà lại những phần phụ thuộc dịch vụ Vercel/Supabase trước khi chuyển.

## Thứ tự triển khai khi tiếp tục

1. Chốt tài khoản triển khai có quyền sử dụng, quyền repo và nhánh POC.
2. Chuẩn bị NestJS, PostgreSQL schema/migrations và script import dữ liệu mẫu.
3. Triển khai đăng nhập, API nội dung và các kiểm soát truy cập.
4. Kết nối FE, xử lý cache/offline và media thử nghiệm.
5. Thiết lập đồng bộ/deploy và kiểm chứng các tiêu chí POC.
6. Đánh giá kết quả rồi quyết định tiếp tục Vercel/Supabase hoặc mua VPS và chuyển dần toàn bộ app.

## Tài liệu tham khảo

- Vercel NestJS: https://vercel.com/docs/frameworks/backend/nestjs
- Vercel Git deployment và điều kiện tài khoản: https://vercel.com/docs/git
- Vercel Functions limits: https://vercel.com/docs/functions/limitations
- Supabase pricing: https://supabase.com/pricing
- Supabase PostgreSQL connections: https://supabase.com/docs/guides/database/connecting-to-postgres
- GitHub forks: https://docs.github.com/en/pull-requests/reference/forks
- GitHub duplicate repositories: https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository
- GitHub release assets: https://docs.github.com/en/rest/releases/assets
- NestJS authorization: https://docs.nestjs.com/security/authorization
- NestJS rate limiting: https://docs.nestjs.com/security/rate-limiting
- DigitalOcean Droplets pricing: https://www.digitalocean.com/pricing/droplets
