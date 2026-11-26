"""
Mask gradient for MaskablePPO (from PetriRL): during PPO updates, the raw probability of masked actions
is pushed down. push_coef = 0 is plain MaskablePPO.
Saved agents reference this module as "mask_gradient"; services/agents.py registers that alias.
"""
import numpy as np
import torch
from sb3_contrib import MaskablePPO
from sb3_contrib.common.maskable.policies import MaskableActorCriticPolicy


class PushMasked(torch.autograd.Function):
    """Identity on the logits; the backward pass adds coef * grad(-log P_valid), capped at
    max_ratio times the norm of PPO's own gradient."""

    @staticmethod
    def forward(ctx, logits, masks, coef, max_ratio):
        ctx.save_for_backward(logits, masks)
        ctx.coef, ctx.max_ratio = coef, max_ratio
        return logits.clone()

    @staticmethod
    def backward(ctx, grad):
        logits, masks = ctx.saved_tensors
        p = torch.softmax(logits, dim=1)
        p_valid = (p * masks).sum(dim=1, keepdim=True)
        push = p * ~masks - p * masks * (1 - p_valid) / p_valid.clamp_min(1e-12)
        push = ctx.coef * push / logits.shape[0]
        push = push * torch.clamp(ctx.max_ratio * grad.norm() / (push.norm() + 1e-12), max=1.0)
        return grad + push, None, None, None


class PushMaskedPolicy(MaskableActorCriticPolicy):
    push_coef, max_ratio = 0.0, 0.1
    raw_masked_mass = float("nan")

    def evaluate_actions(self, obs, actions, action_masks=None):
        self._train_masks = action_masks
        try:
            return super().evaluate_actions(obs, actions, action_masks)
        finally:
            self._train_masks = None

    def _get_action_dist_from_latent(self, latent_pi):
        logits = self.action_net(latent_pi)
        masks = getattr(self, "_train_masks", None)
        if masks is not None:
            masks = torch.as_tensor(masks, device=logits.device).bool()
            with torch.no_grad():
                self.raw_masked_mass = (torch.softmax(logits, dim=1) * ~masks).sum(dim=1).mean().item()
            if self.push_coef > 0:
                logits = PushMasked.apply(logits, masks, self.push_coef, self.max_ratio)
        return self.action_dist.proba_distribution(action_logits=logits)


class PushMaskablePPO(MaskablePPO):
    """No push before push_start (share of training), then a linear ramp to push_coef."""

    def __init__(self, *args, push_coef=1.0, push_start=0.3, push_ramp=0.3, max_ratio=0.1, **kwargs):
        self.push_coef, self.push_start, self.push_ramp = push_coef, push_start, push_ramp
        super().__init__(*args, **kwargs)
        self.policy.max_ratio = max_ratio

    def train(self):
        progress = 1.0 - self._current_progress_remaining
        self.policy.push_coef = self.push_coef * float(np.clip((progress - self.push_start) / self.push_ramp, 0, 1))
        super().train()
        self.logger.record("push/coef", self.policy.push_coef)
        self.logger.record("push/raw_masked_mass", self.policy.raw_masked_mass)
