import { Router } from "express";
import {
  createRoom,
  getRoom,
  joinPlayer,
  joinStaff,
  startRoom,
  listRooms,
} from "../controllers/roomController.js";

const router = Router();

router.post("/", createRoom);
router.get("/:roomId", getRoom);
router.post("/:roomId/join-player", joinPlayer);
router.post("/:roomId/join-staff", joinStaff);
router.post("/:roomId/start", startRoom);
router.get("/", listRooms);

export default router;
