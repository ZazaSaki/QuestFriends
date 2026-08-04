import { Router } from "express";
import {
  listPendingSubmissions,
  validateSubmission,
} from "../controllers/staffController.js";

const router = Router();

router.get("/submissions", listPendingSubmissions);
router.post("/submissions/:id/validate", validateSubmission);

export default router;
