// v0.1: Pages 上で JS が動くことを確認するだけの最小コード
document.getElementById('status').textContent = 'JavaScript は正常に動作しています。';
document.getElementById('run').addEventListener('click', () => {
  const text = document.getElementById('input').value.trim();
  const words = text ? text.split(/\s+/) : [];
  document.getElementById('result').textContent =
    `単語数: ${words.length}（解析機能は v0.2 以降で実装）`;
});
