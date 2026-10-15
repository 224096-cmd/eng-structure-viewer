# scripts/make_figures.py — results/summary_all.csv などから図を作る（Python + matplotlib）
# 使い方: python scripts/make_figures.py
import csv, os, glob
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'results', 'figures'); os.makedirs(OUT, exist_ok=True)
# 日本語フォント
cands = [f for f in font_manager.findSystemFonts() if any(k in os.path.basename(f) for k in ('NotoSansCJK', 'japanese-gothic', 'ipag', 'Yu', 'meiryo', 'msgothic'))]
if cands:
    font_manager.fontManager.addfont(cands[0]); plt.rcParams['font.family'] = font_manager.FontProperties(fname=cands[0]).get_name()
plt.rcParams['axes.unicode_minus'] = False

rows = list(csv.DictReader(open(os.path.join(ROOT, 'results', 'summary_all.csv'), encoding='utf8')))
pos = list(csv.DictReader(open(os.path.join(ROOT, 'results', 'summary_pos_all.csv'), encoding='utf8')))
versions = [v for v in ['v0.3', 'v0.4', 'v0.5', 'v0.6', 'v0.7'] if any(r['version'] == v for r in rows)]
def get(v, ds, rl, col):
    r = [x for x in rows if x['version'] == v and x['dataset'] == ds and int(x['rules_le']) == rl]
    return float(r[0][col]) * 100 if r and r[0][col] else None
# 最大規則レベル（版ごと）
maxrl = {'v0.3': 2, 'v0.4': 2, 'v0.5': 3, 'v0.6': 3, 'v0.7': 3}

# 図1: 学習曲線（評価用、L1 / L2 の文、品詞）
fig, ax = plt.subplots(figsize=(6.4, 4), dpi=150)
L1 = [get(v, 'eval', maxrl[v], 'acc_L1') for v in versions]
L2 = [get(v, 'eval', maxrl[v], 'acc_L2') for v in versions]
both = [(a + b) / 2 for a, b in zip(L1, L2)]
P = [float([x for x in pos if x['version'] == v and x['convention'] == 'ud_convention'][0]['pos_accuracy']) * 100 for v in versions]
ax.plot(versions, both, 'o-', label='文型（L1+L2 の文 100 文）')
ax.plot(versions, L1, 's--', label='文型 レベル1の文（50 文）')
ax.plot(versions, L2, '^--', label='文型 レベル2の文（50 文）')
ax.plot(versions, P, 'd-.', label='品詞（UD 300 文、UD 規約）')
for xs, ys in [(versions, both), (versions, L1), (versions, L2), (versions, P)]:
    for x, y in zip(xs, ys): ax.annotate(f'{y:.0f}', (x, y), textcoords='offset points', xytext=(0, 5), ha='center', fontsize=8)
ax.set_ylim(50, 102); ax.set_ylabel('正解率 (%)'); ax.grid(alpha=.3); ax.legend(fontsize=8, loc='lower right')
ax.set_title('評価用データ（未知の文）での正解率の推移')
fig.tight_layout(); fig.savefig(os.path.join(OUT, 'learning_curve.png')); plt.close(fig)

# 図2: クロス表（最新版、評価用）
v = versions[-1]
M = np.array([[get(v, 'eval', rl, f'acc_L{lv}') or 0 for rl in (1, 2, 3)] for lv in (1, 2, 3)])
fig, ax = plt.subplots(figsize=(5.2, 3.8), dpi=150)
ax.imshow(M, cmap='Blues', vmin=0, vmax=100)
ax.set_xticks(range(3)); ax.set_xticklabels(['規則 ≤1', '規則 ≤2', '規則 ≤3'])
ax.set_yticks(range(3)); ax.set_yticklabels(['レベル1の文', 'レベル2の文', 'レベル3の文'])
for i in range(3):
    for j in range(3): ax.text(j, i, f'{M[i, j]:.1f}%', ha='center', va='center', color='white' if M[i, j] > 60 else 'black', fontsize=10)
ax.set_title(f'{v} 文のレベル × 有効規則（評価用 130 文）')
fig.tight_layout(); fig.savefig(os.path.join(OUT, f'cross_table_{v}.png')); plt.close(fig)

# 図3: 開発用 vs 評価用（最新版、規則≤3）
fig, ax = plt.subplots(figsize=(5.2, 3.6), dpi=150)
labels = ['レベル1', 'レベル2', 'レベル3']
dev = [get(v, 'dev', 3, f'acc_L{lv}') for lv in (1, 2, 3)]; ev = [get(v, 'eval', 3, f'acc_L{lv}') for lv in (1, 2, 3)]
x = np.arange(3); w = 0.36
ax.bar(x - w / 2, dev, w, label='開発用（規則を作りながら見た文）'); ax.bar(x + w / 2, ev, w, label='評価用（未知の文）')
for i in range(3): ax.text(x[i] - w / 2, dev[i] + 1, f'{dev[i]:.0f}', ha='center', fontsize=8); ax.text(x[i] + w / 2, ev[i] + 1, f'{ev[i]:.0f}', ha='center', fontsize=8)
ax.set_xticks(x); ax.set_xticklabels(labels); ax.set_ylim(0, 110); ax.set_ylabel('正解率 (%)'); ax.legend(fontsize=8); ax.set_title(f'{v} 開発用と評価用の差（規則 ≤3）')
fig.tight_layout(); fig.savefig(os.path.join(OUT, 'dev_vs_eval.png')); plt.close(fig)
print('figures written to', OUT)
