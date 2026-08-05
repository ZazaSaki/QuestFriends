import { Router } from "express";
import {
  createRoom,
  listRooms,
  getRoom,
  joinPlayer,
  joinStaff,
  startRoom,
  endRoom,
} from "../controllers/roomController.js";

const router = Router();

router.post("/", createRoom);
router.get("/", listRooms);
router.get("/:roomId", getRoom);
router.post("/:roomId/join-player", joinPlayer);
router.post("/:roomId/join-staff", joinStaff);
router.post("/:roomId/start", startRoom);
router.post("/:roomId/end", endRoom);

export default router;
