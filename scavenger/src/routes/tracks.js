import { Router } from "express";
import { createTrack, appendWaypoints } from "../controllers/trackController.js";

const router = Router();

router.post("/", createTrack);
router.post("/:trackId/waypoints", appendWaypoints);

export default router;
