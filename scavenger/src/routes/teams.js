import { Router } from "express";
import { swapMember } from "../controllers/teamController.js";

const router = Router();

router.put("/swap-member", swapMember);

export default router;
