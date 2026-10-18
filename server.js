import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bitpayRoutes from "./server/bitpay-routes.js";
import torobRoutes from "./server/torob-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/bitpay", bitpayRoutes);
app.use("/torob_api/v3", torobRoutes);

app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
