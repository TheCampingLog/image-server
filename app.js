const express = require("express");
const morgan = require("morgan");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.set("port", process.env.PORT || 8001);

// 미들웨어 설정
app.use(
  cors({
    origin: "*",
  })
);
app.use(morgan("dev"));
app.use(express.json());

//정적 파일 폴더 없으면 생성
const publicDir = path.join(__dirname, "public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

//이미지 폴더가 없으면 생성
const imagesDir = path.join(publicDir, "images");
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// 정적 파일 서빙 - 이미지 접근용
app.use(express.static(publicDir));

// 허용된 카테고리 목록
const allowedCategories = ["member/profile", "review", "board"];

// 카테고리별 폴더 생성 함수
const ensureCategoryDir = (category) => {
  const categoryDir = path.join(imagesDir, category);
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
  }
  return categoryDir;
};

// 서버 시작 시 카테고리 폴더들 미리 생성
allowedCategories.forEach((category) => {
  ensureCategoryDir(category);
});

// Muter 설정 - 동적 저장 경로
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const category = req.params.category;

    // 카테고리 유효성 검사
    if (!allowedCategories.includes(category)) {
      return cb(
        new Error(
          `허용되지 않은 카테고리입니다. 사용 가능 카테고리: ${allowedCategories.join(
            ", "
          )}`
        )
      );
    }

    // 카테고리 폴더 생성 및 반환
    const categoryDir = ensureCategoryDir(category);
    cb(null, categoryDir);
  },
  filename: function (req, file, cb) {
    // 파일명: timestamp_originalname
    const uniqueName = Date.now() + "_" + file.originalname;
    cb(null, uniqueName);
  },
});

// 파일 필터 - 이미지만 허용
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("이미지 파일만 업로드 가능합니다."), false);
  }
};

// Multer 설정
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB 제한
  },
});

// 카테고리별 이미지 업로드 API
app.post("/images/:category", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "파일이 없습니다.",
      });
    }

    const category = req.params.category;

    res.json({
      success: true,
      message: "파일 업로드 성공",
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        category: category,
        url: `/images/${category}/${req.file.filename}`,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "업로드 실패",
      error: error.message,
    });
  }
});

// 카테고리별 다중 이미지 업로드
app.post(
  "/images/:category/multiple",
  upload.array("images", 10),
  (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "파일이 없습니다.",
        });
      }

      const category = req.params.category;
      const uploadedFiles = req.files.map((file) => ({
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        category: category,
        url: `/images/${category}/${file.filename}`,
      }));

      res.json({
        success: true,
        message: `${req.files.length}개 파일 업로드 성공`,
        category: category,
        files: uploadedFiles,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "업로드 실패",
        error: error.message,
      });
    }
  }
);

// 카테고리별 이미지 정보 조회
app.get("/images/:category/:filename", (req, res) => {
  try {
    const category = req.params.category;
    const filename = req.params.filename;

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `허용되지 않은 카테고리입니다. 사용 가능: ${allowedCategories.join(
          ", "
        )}`,
      });
    }

    const filePath = path.join(imagesDir, category, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "파일을 찾을 수 없습니다.",
      });
    }

    const stats = fs.statSync(filePath);
    const ext = path.extname(filename).toLowerCase();

    res.json({
      success: true,
      file: {
        filename: filename,
        category: category,
        url: `/images/${category}/${filename}`,
        size: stats.size,
        extension: ext,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "파일 정보 조회 실패",
      error: error.message,
    });
  }
});

// 에러 헨들링 미들웨어
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "파일 크기가 5MB를 초과했습니다.",
      });
    }
  }

  res.status(500).json({
    success: false,
    message: error.message,
  });
});

// 404 처리
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "페이지를 찾을 수 없습니다.",
  });
});

// 서버 시작
app.listen(app.get("port"), () => {
  console.log(app.get("port"), "번 포트에서 대기중");
});
