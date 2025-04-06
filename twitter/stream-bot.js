const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// Thời gian nghỉ giữa các lần polling (ms)
const POLLING_INTERVAL = 60000; // 1 phút

// Thời gian chờ giữa các lần xử lý tweets (để tránh quá tải)
const PROCESSING_INTERVAL = 300000; // 5 phút

// Biến theo dõi thời gian xử lý gần nhất
let lastProcessingTime = 0;

// Biến kiểm soát trạng thái bot
let isProcessing = false;

// Lấy đường dẫn đầy đủ của node và npm
const nodeCmd = process.execPath;
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

// Đường dẫn đến thư mục hiện tại
const currentDir = process.cwd();

// Hàm lưu log
function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFileSync("stream-bot.log", logMessage);
  console.log(message);
}

// Hàm thực thi lệnh npm với môi trường phù hợp
function executeNpmCommand(command, callback) {
  // Tạo lệnh hoàn chỉnh
  const fullCommand = `${npmCmd} ${command}`;
  logToFile(`Thực thi lệnh: ${fullCommand}`);

  // Chuẩn bị môi trường
  const options = {
    cwd: currentDir,
    env: { ...process.env, PATH: process.env.PATH },
  };

  // Thực thi lệnh
  exec(fullCommand, options, callback);
}

// Hàm kiểm tra xem có tweets mới không
async function checkForNewTweets() {
  try {
    // Kiểm tra file replied_ids.json để xem có tweets mới không
    if (!fs.existsSync("replied_ids.json")) {
      logToFile("File replied_ids.json không tồn tại. Bỏ qua kiểm tra.");
      return false;
    }

    const data = fs.readFileSync("replied_ids.json", "utf-8");
    const repliedData = JSON.parse(data);

    // Nếu có tweets mới chưa được reply
    if (
      repliedData.new_conversations &&
      repliedData.replied_conversations &&
      repliedData.new_conversations.length > 0
    ) {
      // Kiểm tra xem có tweet chưa được xử lý
      const unprocessedTweets = repliedData.new_conversations.filter(
        (id) => !repliedData.replied_conversations.includes(id)
      );

      return unprocessedTweets.length > 0;
    }

    return false;
  } catch (error) {
    logToFile(`Lỗi khi kiểm tra tweets mới: ${error.message}`);
    return false;
  }
}

// Hàm chạy polling kiểm tra tweets mới
async function pollForNewTweets() {
  try {
    // Kiểm tra nếu đang trong giờ nghỉ (1-5 giờ sáng)
    const currentHour = new Date().getHours();
    if (currentHour >= 1 && currentHour <= 5) {
      logToFile(
        `Đang trong giờ nghỉ (${currentHour} giờ sáng), tạm dừng polling.`
      );
      setTimeout(pollForNewTweets, POLLING_INTERVAL);
      return;
    }

    // Kiểm tra xem đã đủ thời gian để xử lý tweets tiếp theo chưa
    const currentTime = Date.now();
    const timeElapsed = currentTime - lastProcessingTime;

    if (timeElapsed < PROCESSING_INTERVAL) {
      logToFile(
        `Chưa đủ thời gian giữa các lần xử lý (${Math.floor(
          timeElapsed / 1000
        )}s/${PROCESSING_INTERVAL / 1000}s). Tiếp tục polling.`
      );
      setTimeout(pollForNewTweets, POLLING_INTERVAL);
      return;
    }

    // Nếu đang xử lý, bỏ qua
    if (isProcessing) {
      logToFile("Đang xử lý tweets, bỏ qua polling lần này.");
      setTimeout(pollForNewTweets, POLLING_INTERVAL);
      return;
    }

    // Chạy một lần để refresh danh sách tweets
    logToFile("Chạy refresh tweets...");

    executeNpmCommand(
      "run dev -- --check-only",
      async (error, stdout, stderr) => {
        if (error) {
          logToFile(`Lỗi khi refresh tweets: ${error.message}`);
        } else {
          logToFile("Đã refresh danh sách tweets.");
        }

        // Kiểm tra xem có tweets mới không
        const hasNewTweets = await checkForNewTweets();

        if (hasNewTweets) {
          logToFile("Phát hiện tweets mới, bắt đầu xử lý...");
          isProcessing = true;

          // Xử lý tweets mới
          executeNpmCommand(
            "run dev",
            (processError, processStdout, processStderr) => {
              if (processError) {
                logToFile(`Lỗi khi xử lý tweets: ${processError.message}`);
              }

              if (processStderr) {
                logToFile(`Stderr: ${processStderr}`);
              }

              logToFile("Hoàn thành xử lý tweets:");
              logToFile(processStdout);

              // Cập nhật thời gian xử lý gần nhất
              lastProcessingTime = Date.now();
              isProcessing = false;

              // Tiếp tục polling
              setTimeout(pollForNewTweets, POLLING_INTERVAL);
            }
          );
        } else {
          logToFile("Không phát hiện tweets mới.");
          setTimeout(pollForNewTweets, POLLING_INTERVAL);
        }
      }
    );
  } catch (error) {
    logToFile(`Lỗi trong quá trình polling: ${error.message}`);
    setTimeout(pollForNewTweets, POLLING_INTERVAL);
  }
}

// Khởi động quá trình polling
logToFile("Stream Bot khởi động - Bắt đầu polling cho tweets mới...");
pollForNewTweets();
