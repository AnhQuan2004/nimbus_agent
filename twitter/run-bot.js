const { exec } = require("child_process");
const fs = require("fs");

// Cấu hình thời gian chạy (phút) - giảm xuống để phản hồi nhanh hơn
const MIN_INTERVAL = 5; // Tối thiểu 5 phút
const MAX_INTERVAL = 15; // Tối đa 15 phút

// Hàm tạo số ngẫu nhiên trong khoảng
function getRandomInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Hàm lưu log
function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFileSync("bot-runner.log", logMessage);
  console.log(message);
}

// Hàm chạy bot
function runBot() {
  logToFile("Đang chạy bot...");

  // Thực thi lệnh npm run dev
  exec("npm run dev", (error, stdout, stderr) => {
    if (error) {
      logToFile(`Lỗi: ${error.message}`);
      return;
    }
    if (stderr) {
      logToFile(`Stderr: ${stderr}`);
    }

    logToFile("Kết quả chạy bot:");
    logToFile(stdout);

    // Lên lịch chạy lần tiếp theo với thời gian ngẫu nhiên
    scheduleNextRun();
  });
}

// Hàm lên lịch chạy tiếp theo
function scheduleNextRun() {
  const intervalMinutes = getRandomInterval(MIN_INTERVAL, MAX_INTERVAL);
  const intervalMs = intervalMinutes * 60 * 1000;

  logToFile(`Lên lịch chạy lần tiếp theo sau ${intervalMinutes} phút`);

  setTimeout(runBot, intervalMs);
}

// Bắt đầu chu trình
logToFile("Bot runner đã khởi động");
runBot();
