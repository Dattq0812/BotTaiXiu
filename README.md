# Bot Tài Xỉu Discord

Một bot Discord theo kiểu game tài xỉu với phiên cược chung cho cả server. Người chơi nhận xu qua điểm danh và chat, rồi cùng đặt cược vào một phiên đồng bộ thay vì mỗi người được tung riêng.

## Tính năng

- Điểm danh mỗi ngày để nhận thưởng xu.
- Tự động cộng xu khi người dùng chat thường xuyên, có cooldown để tránh spam.
- Đặt cược `tai` hoặc `xiu` vào một phiên chung của server.
- Có thể cược thêm nhiều lần trong cùng phiên nếu giữ nguyên lựa chọn Tài/Xỉu.
- Phiên cược chốt sau một khoảng thời gian, tung 3 xúc xắc một lần và trả kết quả đồng bộ cho tất cả người tham gia.
- Lưu lịch sử 10 phiên gần nhất của từng server.

## Luật chơi

- Bot sẽ tung 3 xúc xắc, mỗi xúc xắc có giá trị từ 1 đến 6.
- Tổng từ 11 trở lên là `tài`.
# Bot Tài Xỉu Discord

Bot Discord game tài xỉu với tiền ảo, điểm danh, thưởng chat và phiên cược chung đồng bộ theo server.

## Tính năng

- Điểm danh mỗi ngày để nhận xu.
- Tự động cộng xu khi người dùng chat đủ điều kiện.
- Đặt cược `tai` hoặc `xiu` trong một phiên chung của server.
- Mỗi phiên chốt sau một khoảng thời gian, tung 3 xúc xắc một lần và trả kết quả đồng bộ cho tất cả người tham gia.
- Lưu lịch sử 10 phiên gần nhất của từng server.
- Chuyển xu bằng `gift` và xin xu có xác nhận bằng nút bấm trong `xin`, kèm embed đếm ngược thời gian hết hạn.

## Luật chơi

- Bot tung 3 xúc xắc, mỗi xúc xắc có giá trị từ 1 đến 6.
- Tổng từ 11 trở lên là `tài`.
- Tổng từ 10 trở xuống là `xỉu`.
- Cược thắng sẽ được cộng lại đúng bằng số xu đã đặt.

## Cài đặt

1. Cài Node.js 18 trở lên.
2. Tạo bot trong Discord Developer Portal.
3. Bật `Message Content Intent` trong phần Privileged Gateway Intents.
4. Mời bot vào server với quyền tối thiểu:
   - View Channels
   - Send Messages
   - Read Message History
   - Manage Expressions (để bot tạo emoji mặt xúc xắc từ `src/images`)
5. Sao chép file `.env.example` thành `.env` và điền token.
6. Cài dependencies:

```bash
npm install
```

7. Chạy bot:

```bash
npm start
```

## Biến môi trường

- `DISCORD_TOKEN`: token bot Discord.
- `DISCORD_CLIENT_ID`: application ID dùng để đăng ký slash commands.
- `DISCORD_GUILD_ID`: ID server test; nếu có, slash commands cập nhật gần như ngay lập tức. Bỏ trống để đăng ký global.
- `PREFIX`: tiền tố lệnh, mặc định là `!`.
- `ENABLE_MESSAGE_CONTENT_INTENT`: đặt `true` nếu bot đã bật Message Content Intent trong Discord Portal.
- `ROUND_BETTING_WINDOW_MS`: thời gian mở của một phiên cược chung, mặc định `30000`.
- `XIN_REQUEST_TIMEOUT_MS`: thời gian chờ phản hồi cho yêu cầu xin xu, mặc định `600000`.
- `DATA_FILE`: đường dẫn file lưu dữ liệu, mặc định `./data/state.json`.
- `STARTING_BALANCE`: số xu ban đầu của người chơi, mặc định `0`.
- `DAILY_REWARD`: thưởng điểm danh, mặc định `100`.
- `CHAT_REWARD_MIN`: thưởng chat tối thiểu.
- `CHAT_REWARD_MAX`: thưởng chat tối đa.
- `CHAT_REWARD_COOLDOWN_MS`: thời gian chờ giữa các lần nhận thưởng chat.
- `CHAT_REWARD_MIN_MESSAGE_LENGTH`: độ dài tin nhắn tối thiểu để được thưởng chat.
- `BET_MIN`: mức cược tối thiểu.
- `TIME_ZONE`: múi giờ dùng cho điểm danh, mặc định `Asia/Ho_Chi_Minh`.

## Lệnh

- `!help` - xem hướng dẫn.
- `!daily` - nhận xu điểm danh.
- `!balance [@user]` - xem số dư của bạn hoặc người được nhắc đến.
- `!gift @user <so_tien>` - gift xu cho người khác.
- `!xin @user <so_tien>` - gửi yêu cầu xin xu, người được xin sẽ thấy nút Đồng ý/Từ chối.
- `!dongy [@user]` - đồng ý yêu cầu xin xu đang chờ, chỉ còn là fallback.
- `!tuchoi [@user]` - từ chối yêu cầu xin xu đang chờ, chỉ còn là fallback.
- `!tai <so_tien>` - đặt cược tài vào phiên đang mở, hoặc tạo phiên mới nếu chưa có.
- `!xiu <so_tien>` - đặt cược xỉu vào phiên đang mở, hoặc tạo phiên mới nếu chưa có.
- Có thể dùng lại `tai`/`xiu` hoặc nút cược để cộng thêm tiền trong cùng phiên; không thể đổi lựa chọn trong phiên đó.
- `!history` - xem 10 phiên gần nhất.
- `/help`, `/daily`, `/balance`, `/gift`, `/xin`, `/tai`, `/xiu`, `/history` - các slash command tương ứng.
- `/game` - mở bảng điều khiển với nút đặt Tài/Xỉu, điểm danh, xem số dư và lịch sử.

## Ghi chú

- Xu chat được cộng tự động khi người dùng nhắn tin đủ dài và không bị cooldown.
- Dữ liệu được lưu vào file JSON nên bot sẽ giữ số dư sau khi restart.
- Phiên cược được chốt đồng bộ cho toàn server, nên mọi người tham gia cùng một round sẽ nhận cùng một kết quả.
- Tin nhắn kết quả mỗi phiên kèm bảng nút để đặt cược ngay cho phiên tiếp theo.
- Bảng phiên đang mở hiển thị thời gian còn lại bằng timestamp Discord tự cập nhật, không gửi tin nhắn liên tục.
- Trạng thái phiên và kết quả được hiển thị trong Embed, các nút thao tác nằm bên dưới và thông tin quan trọng được in đậm.
- Sáu ảnh mặt xúc xắc được đăng ký thành custom emoji `xuc_xac_1` đến `xuc_xac_6` trong server và dùng trực tiếp ở kết quả.
- `!gift` chuyển xu từ bạn sang người được nhắc đến.
- `!xin` tạo yêu cầu xin xu với embed đếm ngược và nút Đồng ý/Từ chối; lệnh `!dongy` và `!tuchoi` vẫn còn để dự phòng.
- Nếu muốn, có thể mở rộng tiếp sang slash commands hoặc thêm bảng xếp hạng.