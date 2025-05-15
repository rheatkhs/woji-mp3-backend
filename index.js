const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { exec } = require("youtube-dl-exec");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

app.post("/download", async (req, res) => {
  const { url } = req.body;
  const outputPath = path.join(__dirname, "audio.mp3");

  if (!url || !url.startsWith("http")) {
    return res.status(400).send("Invalid URL");
  }

  try {
    await exec(url, {
      extractAudio: true,
      audioFormat: "mp3",
      output: outputPath,
    });

    res.download(outputPath, "audio.mp3", (err) => {
      fs.unlink(outputPath, () => {}); // Delete after sending
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Download failed");
  }
});

app.get("/", (_, res) => res.send("Woji Mp3 Backend"));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
