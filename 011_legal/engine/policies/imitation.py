"""OR-informed training, step 1 and 2: expert demonstrations from a metaheuristic, then behavior cloning.

1. demonstrations: each instance is solved by tabu search with the wait action; its machine order is replayed on
   the Petri net (turn_choice), and every decision is recorded: observation, mask, the set of correct actions and
   the return that follows (gamma 1). When several jobs have their turn on different machines at the same moment,
   the order between them does not change the schedule, so all of them count as correct.
2. cloning: the PPO policy is trained to put its probability on the correct set (-log of the set's probability,
   masked), and its value net to predict the returns, so that PPO fine-tuning starts from the expert's behavior
   with a value function that already fits it.
"""
import numpy as np

from engine.envs import make_env
from engine.policies.metaheuristics import search


def demonstrations(instance, reward_f="L", seed=0, evals=20_000, env_name="basic"):
    """Expert episode on one instance: dict of obs, masks, targets (correct-action sets), returns, makespan, waits."""
    jobs = [[(m, p) for m, _, p in job] for job in instance.job_sequences]
    seq, makespan = search("TS", instance.job_sequences, seed=seed, params={"wait": True, "evals": evals})

    order, count = {}, [0] * len(jobs)                    # machine -> operations in the expert's order
    for j in seq:
        order.setdefault(jobs[j][count[j]][0], []).append((j, count[j]))
        count[j] += 1
    released, turn = [0] * len(jobs), {m: 0 for m in order}

    env = make_env(instance, name=env_name, reward_f=reward_f, standby="on", normalize=True)
    obs, _ = env.reset(seed=seed)
    sim = env.sim
    observations, masks, targets, rewards = [], [], [], []
    done = False
    while not done:
        mask = np.asarray(env.action_masks(), dtype=bool)
        ready = []                                        # jobs whose next operation is next on its machine
        for a, on in enumerate(mask):
            tr = sim.action_map[a]
            if on and tr.role == "job_select":
                j = tr.color - 1
                if order[jobs[j][released[j]][0]][turn[jobs[j][released[j]][0]]] == (j, released[j]):
                    ready.append(a)
        target = ready or [sim.standby_index]
        observations.append(obs)
        masks.append(mask)
        targets.append(target)
        action = target[0]
        if ready:
            j = sim.action_map[action].color - 1
            turn[jobs[j][released[j]][0]] += 1
            released[j] += 1
        obs, reward, terminated, truncated, _ = env.step(action)
        rewards.append(reward)
        done = terminated or truncated
    if sim.clock != makespan:
        raise RuntimeError(f"expert replay gave {sim.clock}, the search {makespan}")
    returns = np.cumsum(rewards[::-1])[::-1]
    waits = sum(t == [sim.standby_index] for t in targets)
    return {"obs": observations, "masks": masks, "targets": targets, "returns": list(returns),
            "makespan": makespan, "waits": waits}


def behavior_clone(policy, demos, epochs=30, batch_size=256, lr=1e-3, log=None, cancelled=lambda: False):
    """Trains an sb3 (Maskable)ActorCriticPolicy on the demonstrations. Returns the last epoch's accuracy."""
    import torch

    obs = torch.as_tensor(np.concatenate([np.asarray(d["obs"], dtype=np.float32) for d in demos]))
    masks = torch.as_tensor(np.concatenate([np.asarray(d["masks"]) for d in demos]))
    target = torch.zeros_like(masks)
    for row, t in enumerate(t for d in demos for t in d["targets"]):
        target[row, t] = True
    returns = torch.as_tensor(np.concatenate([np.asarray(d["returns"], dtype=np.float32) for d in demos]))
    n = len(obs)
    opt = torch.optim.Adam(policy.parameters(), lr=lr)
    acc = 0.0
    for epoch in range(epochs):
        if cancelled():
            break
        perm = torch.randperm(n)
        tot_loss, hits = 0.0, 0
        for i in range(0, n, batch_size):
            idx = perm[i:i + batch_size]
            features = policy.extract_features(obs[idx])
            if isinstance(features, tuple):                          # separate actor / critic extractors
                latent_pi = policy.mlp_extractor.forward_actor(features[0])
                latent_vf = policy.mlp_extractor.forward_critic(features[1])
            else:
                latent_pi, latent_vf = policy.mlp_extractor(features)
            logits = policy.action_net(latent_pi).masked_fill(~masks[idx], -1e8)
            logp = torch.log_softmax(logits, dim=1)
            set_logp = torch.logsumexp(logp.masked_fill(~target[idx], -1e8), dim=1)
            value = policy.value_net(latent_vf).squeeze(1)
            loss = -set_logp.mean() + 0.5 * torch.nn.functional.mse_loss(value, returns[idx])
            opt.zero_grad()
            loss.backward()
            opt.step()
            tot_loss += loss.item() * len(idx)
            hits += int(target[idx].gather(1, logits.argmax(1, keepdim=True)).sum())
        acc = hits / n
        if log and (epoch % 5 == 4 or epoch == epochs - 1):
            log(f"cloning epoch {epoch + 1}/{epochs}: loss {tot_loss / n:.3f}, expert action matched {100 * acc:.1f}%")
    return acc
