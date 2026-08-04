import { Router } from "express";
import {
  currentState,
  nextCoordinate,
  unlockQuest,
  uploadUrl,
  submit,
} from "../controllers/playController.js";

const router = Router();

router.get("/current-state", currentState);
router.get("/next-coordinate", nextCoordinate);
router.post("/unlock-quest", unlockQuest);
router.get("/upload-url", uploadUrl);
router.post("/submit", submit);

export default router;
