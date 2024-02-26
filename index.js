const http = require("http");
const bodyParser = require("body-parser");
const express = require("express");
const app = express();
const cors = require("cors");
const server = http.createServer(app);
const fs = require("fs");
require("dotenv/config");
const { Client, MessageMedia } = require("whatsapp-web.js");

const { default: axios } = require("axios");

const io = require("socket.io")(server, {
  cors: {
    origin: "*",
  },
});

app.use(cors());

// Online users's array
let users = [];

app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());

// Listen to server
server.listen(process.env.PORT || 5000, () =>
  console.log("Server is listening " + "at " + (process.env.PORT || 5000))
);

const { allSessionsObj } = require("./values.js");

// Whatsapp Messaging events
const createWhatsappSession = (id, deviceId, socket) => {
  const cl = allSessionsObj[`user-${id}`];
  if (cl && cl?.info) {
    socket.emit("whatsapp_user_ready", { ...cl.info, sessionId: id, deviceId });

    cl.on("message", () => {
      socket.emit("whatsapp_new_message");
    });

    cl.on("message_create", () => {
      socket.emit("whatsapp_new_message");
    });

    cl.on("disconnected", () => {
      console.log("Client disconnected: ", id);
      socket.emit("whatsapp_user_disconnected", id);
    });

    cl.on("authenticated", () => {
      console.log("Client is authenticated");
    });
  } else {
    const client = new Client({
      puppeteer: {
        headless: true,
        args: ["--no-sandbox"],
      },
    });

    console.log("new user");

    client.on("message", () => {
      socket.emit("whatsapp_new_message");
    });

    client.on("message_create", () => {
      socket.emit("whatsapp_new_message");
    });

    client.on("disconnected", () => {
      socket.emit("whatsapp_user_disconnected", id);
    });

    client.on("authenticated", () => {
      console.log("Authenticated");
    });

    client.on("qr", (qr) => {
      console.log("QR Received");
      allSessionsObj[`user-${id}`] = client;
      socket.emit("whatsapp_qr", qr);
    });

    client.on("ready", async () => {
      console.log("Client is ready!!");
      const contacts = client.getContacts();
      console.log(contacts);
      allSessionsObj[`user-${id}`] = client;
      socket.emit("whatsapp_user_ready", {
        ...client.info,
        sessionId: id,
        deviceId,
      });
    });

    client.on("loading_screen", (data) => {
      console.log(data);
      socket.emit("whatsapp_authenticating", data);
    });

    client.initialize().catch((_) => _);
  }
};

io.on("connection", (socket) => {
  socket.on("whatsapp_create_session", (data) => {
    console.log("Session is being created::", data.id);
    const { id, deviceId } = data;
    createWhatsappSession(id, deviceId, socket);
  });

  socket.on("whatsapp_get_profile_picture", async ({ id }) => {
    const cl = allSessionsObj[`user-${id}`];
    if (cl) {
      const profileImg = await cl?.getProfilePicUrl(cl?.info?.wid?._serialized);
      socket.emit("whatsapp_profile_picture", profileImg);
    } else {
      socket.emit("whatsapp_profile_picture", null);
    }
  });

  socket.on("whatsapp_get_chat", async ({ id, contact }) => {
    const cl = allSessionsObj[`user-${id}`];
    if (cl) {
      const chats = await cl?.getChats();
      const chat = chats.find((chat) => chat.id.user === String(contact));

      if (chat) {
        const messages = await chat.fetchMessages({ limit: 30 });
        socket.emit("whatsapp_chat", messages);
      } else {
        socket.emit("whatsapp_chat", []);
      }
    } else {
      socket.emit("whatsapp_chat", []);
    }
  });

  socket.on("whatsapp_destroy_client", async (clientId) => {
    const cl = allSessionsObj[`user-${clientId}`];
    if (cl) {
      await cl.destroy();
      delete allSessionsObj[`user-${clientId}`];
      console.log("Client destroyed: ", clientId);
    }
  });

  socket.on(
    "whatsapp_send-message",
    async ({ id, to, msg, type, base64Image }) => {
      const cl = allSessionsObj[`user-${id}`];
      if (cl) {
        if (type === "text") {
          await cl.sendMessage(to, msg);
        } else if (type === "img") {
          const image = new MessageMedia(
            "image/jpeg",
            base64Image.split(";base64,").pop(),
            "image.jpg"
          );
          await cl.sendMessage(to + "@c.us", image);
        }
        socket.emit("whatsapp_sent");
      } else {
        socket.emit("whatsapp_failed");
      }
    }
  );

  socket.on("whatsapp_get-all-chats", async ({ id }) => {
    const cl = allSessionsObj[`user-${id}`];
    if (cl) {
      const allChats = await cl?.getChats();
      socket.emit("whatsapp_all-chats", allChats);
    } else {
      socket.emit("whatsapp_all-chats", []);
    }
  });

  socket.on("whatsapp_check_device_exists", ({ id }) => {
    console.log("User Checked", id);
    socket.emit(
      "whatsapp_check_device",
      allSessionsObj[`user-${id}`] ? true : false
    );
  });

  socket.on("whatsapp_check_device_exists_send_msg_modal", ({ id }) => {
    console.log("User Checked in send message modal", id);
    socket.emit(
      "whatsapp_check_device_send_msg_modal",
      allSessionsObj[`user-${id}`] ? true : false
    );
  });

  socket.on("whatsapp_logout-user", async ({ id }) => {
    const cl = allSessionsObj[`user-${id}`];
    if (cl) {
      await cl.logout();
      delete allSessionsObj[`user-${id}`];
      console.log("User logged out: ", id);
      socket.emit("whatsapp_logged-out", {
        status: true,
        id,
      });
    }
  });

});
