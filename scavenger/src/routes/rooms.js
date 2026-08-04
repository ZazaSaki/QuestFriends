import { Router } from "express";
import {
  createRoom,
  joinPlayer,
  joinStaff,
  startRoom,
} from "../controllers/roomController.js";

const router = Router();

router.post("/", createRoom);
router.post("/:roomId/join-player", joinPlayer);
router.post("/:roomId/join-staff", joinStaff);
router.post("/:roomId/start", startRoom);

export default router;
