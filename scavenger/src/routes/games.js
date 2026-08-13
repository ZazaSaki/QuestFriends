import { Router } from "express";
import { createGame, getGame, listGames } from "../controllers/gameController.js";


const router = Router();

router.post("/", createGame);
router.get("/:gameId", getGame);
router.get("/", listGames);
router.get("/:gameId", getGame);

export default router;