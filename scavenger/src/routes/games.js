import { Router } from "express";
import { createGame } from "../controllers/gameController.js";

const router = Router();

router.post("/", createGame);

export default router;
