import { Router } from "express";
import {
  createGame,
  listGames,
  getGame,
  updateGame,
  deleteGame,
} from "../controllers/gameController.js";

const router = Router();

router.post("/", createGame);
router.get("/", listGames);
router.get("/:gameId", getGame);
router.put("/:gameId", updateGame);
router.delete("/:gameId", deleteGame);

export default router;
