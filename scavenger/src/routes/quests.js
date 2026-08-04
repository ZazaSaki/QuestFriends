import { Router } from "express";
import { createQuest } from "../controllers/questController.js";

const router = Router();

router.post("/", createQuest);

export default router;
