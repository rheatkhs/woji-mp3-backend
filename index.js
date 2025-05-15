const express = require("express");
const cors = require("cors");
const { exec } = require("youtube-dl-exec");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { createClient } = require("@supabase/supabase-js");
const fsSync = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Supabase credentials
const SUPABASE_URL = "https://xxetpfobzupsoxfppqfm.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4ZXRwZm9ienVwc294ZnBwcWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcyOTU0OTcsImV4cCI6MjA2Mjg3MTQ5N30.vp9yEgxgvDM5R44uSaH7XY8BHZo8d7F9IPF0FyHK6D4";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET_NAME = "mp3-files";

app.post("/download", async (req, res) => {
  const url = req.body?.url?.trim() || req.query?.url?.trim();
  const urlRegex = /^https?:\/\/.+/;
  if (!url || !urlRegex.test(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempOutputTemplate = path.join(os.tmpdir(), `${tempId}.%(ext)s`);
  const finalOutputPath = path.join(os.tmpdir(), `${tempId}.mp3`);
  const supabaseFilePath = `audio/${tempId}.mp3`;

  try {
    console.log("Starting download...");

    await exec(url, {
      extractAudio: true,
      audioFormat: "mp3",
      output: tempOutputTemplate,
      ffmpegLocation: "C:/ffmpeg/bin/ffmpeg.exe",
    });

    // Ensure the file exists
    if (!fsSync.existsSync(finalOutputPath)) {
      throw new Error("MP3 file not found after download");
    }

    const fileBuffer = await fs.readFile(finalOutputPath);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(supabaseFilePath, fileBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return res.status(500).json({ error: "Upload to Supabase failed" });
    }

    // Save download record to Supabase Database
    const { error: dbError } = await supabase.from("downloads").insert([
      {
        url,
        file_path: supabaseFilePath,
      },
    ]);

    if (dbError) {
      console.error("DB insert error:", dbError);
      return res.status(500).json({ error: "Database insert failed" });
    }

    // Respond with success
    res.status(200).json({
      message: "File uploaded to Supabase successfully",
      file_path: supabaseFilePath,
    });

    // Cleanup temp file
    await fs.unlink(finalOutputPath);
    console.log("Cleaned up:", finalOutputPath);
  } catch (error) {
    console.error("Error during download process:", error.message || error);
    res.status(500).json({ error: "Download or processing failed" });
  }
});

app.get("/", (_, res) => res.send("Woji Mp3 Backend Running"));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
