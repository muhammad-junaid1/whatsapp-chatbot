const express = require("express");
const values = require("../values.js");

const router = express.Router();
const { MessageMedia } = require("whatsapp-web.js");
const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/sendBulkMessage", upload.single("img"), async (req, res) => {
  try {
    const { id, caption, contacts } = req.body;
    const cl = values.allSessionsObj[`user-${id}`];
    if (cl) {
      const promises = JSON.parse(contacts)?.map(async (contact) => {
        if (req.file) {
          const image = await new MessageMedia(
            "image/png",
            req.file.buffer.toString("base64")
          );
          return cl.sendMessage(contact + "@c.us", image, {
            caption: caption,
          });
        } else {
          return cl.sendMessage(contact + "@c.us", caption);
        }
      });
      const result = await Promise.all(promises);
      res.send();
    } else {
      console.log("Client not found");
      res.status(500).send();
    }
  } catch (error) {
    res.status(500).send();
    console.log(error);
  }
});


module.exports = router;
