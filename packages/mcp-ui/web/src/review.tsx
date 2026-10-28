import { mount } from "./mount.tsx";
import { BlockReview } from "./views/BlockReview.tsx";
import { ClaimsView } from "./views/ClaimsView.tsx";
import { OutlineView } from "./views/OutlineView.tsx";
import { PlanView } from "./views/PlanView.tsx";
import { QuestionsView } from "./views/QuestionsView.tsx";
import { StyleView } from "./views/StyleView.tsx";
import { VariantsView } from "./views/VariantsView.tsx";

mount({
  ask_questions: QuestionsView,
  review_writing_plan: PlanView,
  review_claims: ClaimsView,
  review_outline: OutlineView,
  review_variants: VariantsView,
  review_block: BlockReview,
  review_style_candidates: StyleView,
});
