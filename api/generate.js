// api/generate.js  （Node 18+）
// 统一入口：支持 backend = 'replicate' | 'a1111' | 'openai'(占位)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { backend, prompt, image_base64 } = req.body || {};
    if (!backend || !prompt || !image_base64) return res.status(400).json({ error: 'Missing fields' });

    if (backend === 'replicate') {
      // 使用 Instruct-Pix2Pix（能根据文字编辑图片）
      const token = process.env.REPLICATE_API_TOKEN;
      if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set' });

      // 把 base64 转成 data URL（Replicate 接口常用 http(s) URL，这里用上传代理或直接base64上传的变体）
      const uploadResp = await fetch('https://api.replicate.com/v1/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: image_base64, filename: 'input.png' })
      });
      if (!uploadResp.ok) {
        const t = await uploadResp.text();
        return res.status(500).json({ error: 'upload failed: '+t });
      }
      const { id: fileId } = await uploadResp.json();
      const imageUrl = `https://api.replicate.com/v1/files/${fileId}/content`;

      // timbrooks/instruct-pix2pix 适合"根据文字编辑现有图片"
      const pred = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: "fb8af171bfe0aab52b0da41da652262e7490efa4693e6e5d42c1b6c3b5b6d0d6", // instruct-pix2pix 某稳定版本ID（示例）
          input: {
            image: imageUrl,
            prompt: prompt,
            guidance_scale: 7,
            num_inference_steps: 50
          }
        })
      });
      if (!pred.ok) {
        const t = await pred.text();
        return res.status(500).json({ error: 'predict failed: '+t });
      }
      let prediction = await pred.json();
      // 轮询直到完成
      while (prediction.status === 'starting' || prediction.status === 'processing') {
        await new Promise(r => setTimeout(r, 1500));
        const r2 = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        prediction = await r2.json();
      }
      if (prediction.status !== 'succeeded') {
        return res.status(500).json({ error: 'generation failed', details: prediction.error || prediction });
      }
      // outputs 通常是图片URL数组
      const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      return res.status(200).json({ image_url: url });
    }

    if (backend === 'a1111') {
      // 本地 Automatic1111 WebUI img2img
      const base = process.env.A1111_BASE_URL || 'http://127.0.0.1:7860';
      const payload = {
        prompt,
        negative_prompt: "deformed, extra fingers, disfigured, poorly drawn, low quality, blurry",
        denoising_strength: 0.55,
        cfg_scale: 7,
        steps: 35,
        sampler_name: "DPM++ 2M Karras",
        init_images: [ `data:image/png;base64,${image_base64}` ],
        resize_mode: 0
      };
      const r = await fetch(`${base}/sdapi/v1/img2img`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
      if(!r.ok){ const t=await r.text(); return res.status(500).json({ error:'a1111 failed: '+t });}
      const out = await r.json(); // { images: ["<base64>", ...] }
      return res.status(200).json({ image_base64: out.images?.[0] });
    }

    if (backend === 'openai') {
      // 占位：如需用 OpenAI 的图像编辑，请在此调用你的后端逻辑
      return res.status(501).json({ error: 'OpenAI backend not implemented in this sample.' });
    }

    return res.status(400).json({ error: 'Unknown backend' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error', details: String(e) });
  }
}
