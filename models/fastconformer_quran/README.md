# fastconformer_quran for Meddeb

`model.q8.onnx` of [https://huggingface.co/Muno459/fastconformer-quran](https://huggingface.co/Muno459/fastconformer-quran) by Muno459, re-hosted for the Meddeb app with the author's permission
(requested for Meddeb when access to the model was granted on Hugging Face). Licence: NPL-1.1 (non-commercial, share-alike), see LICENSE.

GitHub refuses files over 100 MB, so the file is split into 3 parts; `manifest.json` gives the size and
SHA-256 of the whole file and of each part. The Meddeb app downloads the parts, checks them, joins them and
checks the result. By hand: `cat model.q8.onnx.part* > model.q8.onnx` (Linux/macOS) or
`copy /b model.q8.onnx.part01+model.q8.onnx.part02+model.q8.onnx.part03 model.q8.onnx` (Windows), then compare its SHA-256 with the manifest.
