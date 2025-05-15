const express = require("express");
const cors = require("cors");
const { exec } = require("youtube-dl-exec");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET_NAME = "mp3-files";

app.post("/download", async (req, res) => {
  const url = req.body?.url?.trim() || req.query?.url?.trim();
  const urlRegex = /^https?:\/\/.+/;

  if (!url || !urlRegex.test(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  res.status(202).json({ message: "Download started", jobId });

  processDownloadJob(url, jobId).catch((err) =>
    console.error(`❌ Job failed [${jobId}]:`, err.message)
  );
});

async function processDownloadJob(url, jobId) {
  const outputTemplate = path.join(os.tmpdir(), `${jobId}.%(ext)s`);
  const outputMp3 = path.join(os.tmpdir(), `${jobId}.mp3`);
  const supabaseFilePath = `audio/${jobId}.mp3`;

  console.log(`[${jobId}] ▶ Starting download...`);

  await exec(url, {
    extractAudio: true,
    audioFormat: "mp3",
    output: outputTemplate,
    // ffmpegLocation: "C:/ffmpeg/bin/ffmpeg.exe",
  });

  if (!fsSync.existsSync(outputMp3)) {
    throw new Error("MP3 file not found after download");
  }

  const buffer = await fs.readFile(outputMp3);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(supabaseFilePath, buffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (uploadError) {
    throw new Error("Upload to Supabase failed: " + uploadError.message);
  }

  const { data: inserted, error: dbError } = await supabase
    .from("downloads")
    .insert([
      {
        url,
        file_path: supabaseFilePath,
        job_id: jobId,
      },
    ])
    .select();

  if (dbError || !inserted || inserted.length === 0) {
    throw new Error(
      "Database insert failed: " + (dbError?.message || "unknown")
    );
  }

  console.log(`[${jobId}] ✅ Inserted row:`, inserted[0]);

  await fs.unlink(outputMp3);
  console.log(`[${jobId}] ✅ Completed and cleaned up`);
}

app.get("/", (_, res) => res.send("Woji Mp3 Backend Running"));

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
