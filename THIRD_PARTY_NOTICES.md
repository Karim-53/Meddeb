# Third-party notices

Meddeb, Copyright (c) 2026 Mohamed Karim Belaid, is licensed under the Meddeb No-Profit License 1.0
(draft): see LICENSE.md. That licence covers only Meddeb's own code, interface and documentation.

The components below are not Meddeb's work. Each one is used under its own licence or terms, which stay
in force for it; nothing in the Meddeb licence limits the rights that those licences give you. The full
licence texts are in the folder licenses/ next to this file; each entry names its file.

Checked on 2026-10-01 for the Android app 0.5, the PC app and the web repository.

Where a component ships:

- Android app: inside the APK of Meddeb for Android.
- Android app, downloaded: fetched by the Android app when needed, not inside the APK.
- Web: in the public repository https://github.com/Karim-53/Meddeb (site: https://karim-53.github.io/Meddeb/).
- PC app: the PC version, run from the source repository on the user's own computer.
- Dev only: used to build, test or evaluate Meddeb; never shipped.

Contents

1. Qur'an text and data
2. Speech model
3. Recitation audio (Listen)
4. Fonts
5. Android app: Java and Kotlin libraries
6. Android app: Python (Chaquopy)
7. PC app: Python packages and fallback models (not redistributed)
8. Development only
9. Files in licenses/


## 1. Qur'an text and data

### Tanzil Quran Text (Uthmani, Simple, Simple Clean)

- Version: 1.1 (all three texts), downloaded from Tanzil in 2026; the ayah lines are unchanged.
- SPDX: CC-BY-3.0, with Tanzil's terms of use (verbatim copies only)
- Copyright: Copyright (C) 2007-2026 Tanzil Project
- Source: https://tanzil.net (updates: http://tanzil.net/updates/)
- Ships in: Android app and PC app. Meddeb displays the Uthmani text; the Simple texts are the reference
  for the speech recognition. The PC app reads the three files (recite/data/quran_*.txt); the apps carry
  the word tables built from them (recite/data/quran_words.json.gz).
- Licence text: licenses/tanzil_quran_text.txt (the copyright block of each file, verbatim; in the
  source repository also recite/data/TANZIL_NOTICE.txt); CC BY 3.0:
  https://creativecommons.org/licenses/by/3.0/
- Notes: the Qur'an text may never be changed. The copyright block of the Uthmani text, exactly as Tanzil
  publishes it (the Simple and Simple Clean blocks differ only in their title line):

```
# PLEASE DO NOT REMOVE OR CHANGE THIS COPYRIGHT BLOCK
#====================================================================
#
#  Tanzil Quran Text (Uthmani, Version 1.1)
#  Copyright (C) 2007-2026 Tanzil Project
#  License: Creative Commons Attribution 3.0
#
#  This copy of the Quran text is carefully produced, highly 
#  verified and continuously monitored by a group of specialists 
#  at Tanzil Project.
#
#  TERMS OF USE:
#
#  - Permission is granted to copy and distribute verbatim copies 
#    of this text, but CHANGING IT IS NOT ALLOWED.
#
#  - This Quran text can be used in any website or application, 
#    provided that its source (Tanzil Project) is clearly indicated, 
#    and a link is made to tanzil.net to enable users to keep
#    track of changes.
#
#  - This copyright notice shall be included in all verbatim copies 
#    of the text, and shall be reproduced appropriately in all files 
#    derived from or containing substantial portion of this text.
#
#  Please check updates at: http://tanzil.net/updates/
#
#====================================================================
```

### Tanzil Quran Metadata

- Version: 1.0 (quran-data.js)
- SPDX: CC-BY-3.0
- Copyright: Copyright (C) 2008-2009 Tanzil.info
- Source: https://tanzil.net/res/text/metadata/quran-data.js
- Ships in: Android app and PC app (recite/data/mushaf_meta.json: page, juz and hizb-quarter boundaries;
  adapted: converted to JSON, other tables left out)
- Licence text: licenses/tanzil_quran_text.txt (the file's header, verbatim); CC BY 3.0:
  https://creativecommons.org/licenses/by/3.0/

### Quran.com tajweed markup and chapter list

- Version: quran.com API v4 (uthmani_tajweed verses, chapters), fetched in 2026
- SPDX: NOASSERTION (no licence is published for this data)
- Copyright: Quran.com / Quran Foundation
- Source: https://quran.com , https://api.quran.com/api/v4 ; developer terms:
  https://api-docs.quran.foundation/legal/developer-terms/
- Ships in: Android app and PC app (recite/data/quran_tajweed.json: the tajweed colours;
  recite/data/chapters.json: surah names and ayah counts)
- Licence text: none published; the Quran Foundation developer terms above apply.
- Notes: credit: Quran.com / Quran Foundation. The Meddeb licence grants no right in this data.

### QUL Madani 15-line page layout

- Version: fetched in 2026 from api.qurancdn.com (quran.com QDC API), converted to Meddeb's word numbering
- SPDX: NOASSERTION (no licence is published for this data)
- Copyright: Quranic Universal Library (QUL, Tarteel) / Quran.com
- Source: https://qul.tarteel.ai , https://api.qurancdn.com
- Ships in: Android app and PC app (recite/data/mushaf_lines.json: which words sit on which line of the
  604 pages)
- Licence text: none published. QUL states that the licence differs per resource
  (https://qul.tarteel.ai/faq); the Quran Foundation developer terms apply to the API.
- Notes: credit: QUL (Tarteel) and Quran.com. The Meddeb licence grants no right in this data.


## 2. Speech model

### fastconformer-quran (Muno459 / Quran-Lab)

- Version: Muno459/fastconformer-quran on Hugging Face, the quantised export onnx/model.q8.onnx (as served
  since 2026-09-19) and its tokens.txt
- SPDX: LicenseRef-NPL-1.1 (Quran-Lab No-Profit License 1.1)
- Copyright: Copyright (c) 2026 Muno459 / Quran-Lab
- Source: https://huggingface.co/Muno459/fastconformer-quran
- Ships in: Android app (tokens.txt and the licence file); Android app, downloaded (model.q8.onnx, fetched
  from the web repository at the first microphone press); Web (models/fastconformer_quran/: model.q8.onnx
  in 3 parts, with the licence file); PC app (downloaded from Hugging Face by tools/get_models.py)
- Licence text: licenses/npl_1_1_fastconformer_quran.txt (the same file travels with the model as LICENSE)
- Notes: NPL-1.1 forbids any profit by an application or service that includes the model (§3) and says that
  no commercial licence for it exists (§9). It requires no credit; it is credited anyway.

### Base model: NVIDIA stt_ar_fastconformer_hybrid_large_pcd_v1.0

- Version: v1.0
- SPDX: CC-BY-4.0
- Copyright: NVIDIA Corporation
- Source: https://huggingface.co/nvidia/stt_ar_fastconformer_hybrid_large_pcd_v1.0
- Ships in: as the base of fastconformer-quran (Android app, downloaded; Web; PC app)
- Licence text: licenses/cc_by_4_0.txt (https://creativecommons.org/licenses/by/4.0/)
- Notes: attribution: fastconformer-quran is based on stt_ar_fastconformer_hybrid_large_pcd_v1.0 by NVIDIA,
  licensed under CC BY 4.0; Muno459 modified it (fine-tuned it for Qur'anic recitation and exported it to
  ONNX) and licenses the result under NPL-1.1. The CC BY 4.0 terms cover NVIDIA's material only. The
  training data named in the model card (for example Tarteel's EveryAyah dataset) keep their own licences.

### Demo recitation demo_ikhlas.wav (Abdullah Basfar, Al-Ikhlas)

- Version: demo/02_basfar_ikhlas.wav of the fastconformer-quran repository
- SPDX: NOASSERTION (shipped by the model's author with the model, under NPL-1.1; the recording's own
  licence is not documented)
- Copyright: recitation by Abdullah Basfar; the rights holder of the recording is not documented
- Source: https://huggingface.co/Muno459/fastconformer-quran (folder demo/)
- Ships in: Android app (meddeb_models/fastconformer_quran/demo_ikhlas.wav, the model's self-test)
- Licence text: licenses/npl_1_1_fastconformer_quran.txt (the model repository's licence)
- Notes: to be replaced by a recording of Meddeb's author.


## 3. Recitation audio (Listen)

### Recitation by Yasser Al-Dossary (EveryAyah.com)

- Version: one MP3 file per ayah, 128 kbps (folder Yasser_Ad-Dussary_128kbps, 6,236 ayat)
- SPDX: NOASSERTION. EveryAyah's surah archives say that the files may be used only under the licence of
  VerseByVerseQuran.com; the archived copy of that licence (2012) is CC BY-NC 2.5 Canada.
- Copyright: recitation by Yasser Al-Dossary; files published by EveryAyah.com (VerseByVerseQuran.com)
- Source: https://everyayah.com/data/Yasser_Ad-Dussary_128kbps/ (served through the BunnyCDN network)
- Ships in: not in the APK nor in any Meddeb repository. Android app, downloaded: Listen stores the ayat it
  plays (and the rest of that surah, fetched on an unmetered network) in the app's own storage, for the
  user's own offline listening. PC app: played from EveryAyah directly (the browser may cache them).
- Licence text: none bundled; CC BY-NC 2.5 Canada: https://creativecommons.org/licenses/by-nc/2.5/ca/
  (archived licence page:
  http://web.archive.org/web/20121021062917/http://www.versebyversequran.com/site/license)
- Notes: credit shown in Listen: "Recitation: Yasser Al-Dossary — audio files: EveryAyah.com". The files
  are not re-hosted; re-hosting them would need the rights holders' permission.


## 4. Fonts

The fonts are the Google Fonts subsets (woff2), unmodified, in d04_meddeb/static/fonts/ with their licence
files (tools/fetch_fonts.py). Under the SIL Open Font License they stay under that licence and may not be
sold by themselves.

### Amiri Quran

- Version: v19 (Google Fonts)
- SPDX: OFL-1.1
- Copyright: Copyright 2010-2022 The Amiri Quran Project Authors (https://github.com/aliftype/amiri)
- Source: https://github.com/aliftype/amiri , https://fonts.google.com/specimen/Amiri+Quran
- Ships in: Android app, PC app (the Qur'anic text)
- Licence text: licenses/ofl_amiri_quran.txt

### Noto Naskh Arabic

- Version: v44 (Google Fonts), weights 400 and 600
- SPDX: OFL-1.1
- Copyright: Copyright 2022 The Noto Project Authors (https://github.com/notofonts/arabic)
- Source: https://github.com/notofonts/arabic , https://fonts.google.com/noto/specimen/Noto+Naskh+Arabic
- Ships in: Android app, PC app (Arabic labels)
- Licence text: licenses/ofl_noto_naskh_arabic.txt

### Inter

- Version: v20 (Google Fonts), weights 400, 500 and 600
- SPDX: OFL-1.1
- Copyright: Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)
- Source: https://github.com/rsms/inter , https://fonts.google.com/specimen/Inter
- Ships in: Android app, PC app (the interface)
- Licence text: licenses/ofl_inter.txt


## 5. Android app: Java and Kotlin libraries

### ONNX Runtime

- Version: com.microsoft.onnxruntime:onnxruntime-android 1.30.0
- SPDX: MIT
- Copyright: Copyright (c) Microsoft Corporation
- Source: https://github.com/microsoft/onnxruntime (tag v1.30.0)
- Ships in: Android app (libonnxruntime.so, libonnxruntime4j_jni.so and the Java API); PC app (the pip
  package onnxruntime 1.30.0, see section 7)
- Licence text: licenses/mit_onnxruntime.txt; ONNX Runtime's own third-party notices (protobuf,
  flatbuffers, Eigen, abseil, ONNX and others): licenses/onnxruntime_third_party_notices.txt; the file
  META-INF/LICENSE-1DS that comes with its Java package is the Apache License 2.0 (licenses/apache_2_0.txt)

### Kotlin standard library

- Version: 2.3.21, with org.jetbrains:annotations 23.0.0 and the empty compatibility artifacts
  kotlin-stdlib-jdk7 1.8.20 and kotlin-stdlib-jdk8 1.8.20
- SPDX: Apache-2.0
- Copyright: Copyright 2010-2024 JetBrains s.r.o and respective authors and developers
- Source: https://github.com/JetBrains/kotlin
- Ships in: Android app
- Licence text: licenses/apache_2_0.txt; NOTICE: licenses/notice_kotlin.txt (reproduced below); code from
  other projects inside the standard library: licenses/kotlin_stdlib_third_party.txt
- Notes: the NOTICE file of Kotlin (Apache License 2.0, section 4(d)), verbatim:

```
   =========================================================================
   ==  NOTICE file corresponding to the section 4 d of                    ==
   ==  the Apache License, Version 2.0,                                   ==
   ==  in this case for the Kotlin Compiler distribution.                 ==
   =========================================================================

   Kotlin Compiler
   Copyright 2010-2024 JetBrains s.r.o and respective authors and developers
```

### kotlinx.coroutines

- Version: kotlinx.coroutines 1.7.3 (core and android) in the 0.5 build; the exact version of a build is in
  the APK file META-INF/kotlinx_coroutines_core.version
- SPDX: Apache-2.0
- Copyright: Copyright 2016-2021 JetBrains s.r.o and respective authors and developers
- Source: https://github.com/Kotlin/kotlinx.coroutines
- Ships in: Android app (pulled in by AndroidX lifecycle)
- Licence text: licenses/apache_2_0.txt; NOTICE: licenses/notice_kotlinx_coroutines.txt (reproduced below,
  as in the 1.7.3 release)
- Notes: the NOTICE file of kotlinx.coroutines (Apache License 2.0, section 4(d)), verbatim:

```
=========================================================================
==  NOTICE file corresponding to the section 4 d of                    ==
==  the Apache License, Version 2.0,                                   ==
==  in this case for the kotlinx.coroutines library.                   ==
=========================================================================

kotlinx.coroutines library.
Copyright 2016-2021 JetBrains s.r.o and respective authors and developers
```

### AndroidX libraries

- Version: core 1.16.0 and webkit 1.14.0, with what they and Media3 pull in (0.5 build, resolved by
  Gradle for the release APK): annotation 1.8.1, annotation-experimental 1.4.1, collection 1.4.2,
  concurrent-futures 1.2.0, arch core-common 2.2.0, arch core-runtime 2.2.0, core-viewtree 1.0.0,
  interpolator 1.0.0, lifecycle-common 2.8.0, lifecycle-runtime 2.8.0, lifecycle-service 2.8.0,
  profileinstaller 1.3.1, startup-runtime 1.1.1, tracing 1.2.0, versionedparcelable 1.1.1,
  exifinterface 1.3.6 (pulled in by Media3), androidx.media 1.7.0 (pulled in by Media3). The APK files
  META-INF/androidx.*.version give the exact versions of a build.
- SPDX: Apache-2.0
- Copyright: Copyright The Android Open Source Project
- Source: https://github.com/androidx/androidx , https://developer.android.com/jetpack/androidx
- Ships in: Android app
- Licence text: licenses/apache_2_0.txt

### AndroidX Media3

- Version: 1.11.1 (media3-exoplayer, media3-session and the modules they use: media3-common,
  media3-container, media3-datasource, media3-decoder, media3-extractor, media3-database)
- SPDX: Apache-2.0
- Copyright: Copyright The Android Open Source Project
- Source: https://github.com/androidx/media
- Ships in: Android app, from 0.5 (Listen playback, launcher shortcuts, Android Auto)
- Licence text: licenses/apache_2_0.txt

### Guava

- Version: 33.3.1-android (com.google.guava:guava, with failureaccess 1.0.2 and the empty listenablefuture
  9999.0-empty-to-avoid-conflict-with-guava), from 0.5 (needed by Media3)
- SPDX: Apache-2.0
- Copyright: Copyright (C) The Guava Authors
- Source: https://github.com/google/guava
- Ships in: Android app
- Licence text: licenses/apache_2_0.txt

### JSpecify annotations

- Version: org.jspecify:jspecify 1.0.0 (pulled in by AndroidX core and webkit)
- SPDX: Apache-2.0
- Copyright: Copyright The JSpecify Authors
- Source: https://github.com/jspecify/jspecify
- Ships in: Android app
- Licence text: licenses/apache_2_0.txt

### Chaquopy

- Version: 17.0.0 (Gradle plugin and runtime: libchaquopy_java.so, chaquopy.so, the "java" Python package)
- SPDX: MIT
- Copyright: Copyright (c) 2017-2025 Chaquo Ltd and contributors
- Source: https://github.com/chaquo/chaquopy (tag 17.0.0)
- Ships in: Android app
- Licence text: licenses/mit_chaquopy.txt


## 6. Android app: Python (Chaquopy)

### CPython

- Version: 3.12.12 (Chaquopy's Android build: libpython3.12.so and the standard library)
- SPDX: PSF-2.0
- Copyright: Copyright (c) 2001-2023 Python Software Foundation; All Rights Reserved (the full notice is in
  the licence text)
- Source: https://www.python.org , https://github.com/python/cpython (tag v3.12.12)
- Ships in: Android app. The PC app runs on the user's own Python 3.12 (not redistributed).
- Licence text: licenses/psf_2_0_cpython_3_12.txt; the software incorporated in CPython (expat, libffi,
  libmpdec, zlib, OpenSSL, SipHash, dtoa and others): licenses/cpython_3_12_incorporated_software.txt

### Libraries built into Chaquopy's Python

- Version: OpenSSL 3.0.18 (libcrypto_python.so, libssl_python.so); SQLite 3.50.4 (libsqlite3_python.so);
  bzip2 1.0.8 (module _bz2); xz / liblzma 5.4.6 (module _lzma); libffi (module _ctypes); expat and libmpdec
  (the copies in CPython 3.12.12)
- SPDX: Apache-2.0 (OpenSSL); blessing (SQLite, public domain); bzip2-1.0.6 (bzip2); LicenseRef-Public-Domain
  (liblzma 5.4.6); MIT (libffi, expat); BSD-2-Clause (libmpdec)
- Copyright: The OpenSSL Project Authors; SQLite: public domain; bzip2: Julian R Seward; liblzma: public
  domain (Lasse Collin, the Tukaani Project); libffi: Anthony Green, Red Hat, Inc. and others; expat: Thai
  Open Source Software Center Ltd, Clark Cooper and the Expat maintainers; libmpdec: Stefan Krah
- Source: https://www.openssl.org , https://sqlite.org , https://sourceware.org/bzip2/ ,
  https://tukaani.org/xz/ , https://sourceware.org/libffi/ , https://libexpat.github.io ,
  https://www.bytereef.org/mpdecimal/
- Ships in: Android app
- Licence text: licenses/apache_2_0.txt (OpenSSL); licenses/cpython_3_12_incorporated_software.txt (libffi,
  expat, libmpdec, OpenSSL). SQLite and liblzma 5.4.6 are in the public domain; the bzip2 licence asks
  only source copies to keep its notice (https://sourceware.org/bzip2/).

### Mozilla CA certificate list (cacert.pem)

- Version: the cacert.pem that Chaquopy 17.0.0 bundles for SSL certificate checks
- SPDX: MPL-2.0
- Copyright: Mozilla Foundation and contributors (Mozilla's CA certificate data)
- Source: https://wiki.mozilla.org/CA ; packaged in the format of certifi,
  https://github.com/certifi/python-certifi
- Ships in: Android app (assets/chaquopy/cacert.pem, unmodified)
- Licence text: licenses/mpl_2_0.txt
- Notes: the file is plain text and is its own Source Code Form (MPL-2.0 section 3.2).

### NumPy

- Version: 1.26.2 (Chaquopy build)
- SPDX: BSD-3-Clause (bundled code: lapack-lite BSD-3-Clause, dragon4 MIT, libdivide Zlib)
- Copyright: Copyright (c) 2005-2023, NumPy Developers
- Source: https://numpy.org , https://github.com/numpy/numpy (tag v1.26.2)
- Ships in: Android app. The PC app uses the pip package numpy 2.5.3 (section 7).
- Licence text: licenses/numpy_1_26_2.txt

### OpenBLAS

- Version: 0.2.20 (Chaquopy build, used by NumPy)
- SPDX: BSD-3-Clause
- Copyright: Copyright (c) 2011-2014, The OpenBLAS Project
- Source: https://github.com/OpenMathLib/OpenBLAS
- Ships in: Android app
- Licence text: licenses/openblas_0_2_20.txt

### libgfortran

- Version: 4.9 (Chaquopy's chaquopy_libgfortran package, used by OpenBLAS)
- SPDX: GPL-3.0-or-later WITH GCC-exception-3.1
- Copyright: Copyright (C) 2002-2014 Free Software Foundation, Inc.
- Source: https://gcc.gnu.org (GCC 4.9, libgfortran/); Chaquopy's build recipe:
  https://github.com/chaquo/chaquopy/tree/master/server/pypi/packages/chaquopy-libgfortran
- Ships in: Android app
- Licence text: licenses/libgfortran_gcc_runtime_exception.txt and licenses/gpl_3_0.txt
- Notes: the GCC Runtime Library Exception 3.1 lets a program combined with this runtime library be
  conveyed under other terms (see its text); the library's source code is available at the addresses above.

### LLVM libc++

- Version: libc++ of LLVM 18 (Chaquopy's chaquopy_libcxx package, 180000)
- SPDX: Apache-2.0 WITH LLVM-exception
- Copyright: the LLVM Project contributors
- Source: https://github.com/llvm/llvm-project (libcxx/)
- Ships in: Android app
- Licence text: licenses/libcxx_apache_2_0_llvm_exception.txt

### setuptools and pyelftools (Chaquopy's bootstrap)

- Version: setuptools 68.2.2 (pkg_resources, with packaging 23.1, platformdirs 2.6.2, more_itertools 9.1.0,
  jaraco.context 4.3.0, jaraco.functools 3.6.0, jaraco.text 3.7.0, zipp 3.7.0, typing_extensions 4.4.0,
  importlib_resources 5.10.2); pyelftools 0.26 (with construct)
- SPDX: MIT (setuptools, jaraco.*, more_itertools, platformdirs, zipp, construct); Apache-2.0 OR
  BSD-2-Clause (packaging); PSF-2.0 (typing_extensions); Apache-2.0 (importlib_resources); Unlicense
  (pyelftools)
- Copyright: Jason R. Coombs (jaraco.*, zipp); Erik Rose (more_itertools); the platformdirs developers;
  Donald Stufft and individual contributors (packaging); Python Software Foundation (typing_extensions);
  Tomer Filiba and Corbin Simpson (construct); pyelftools is in the public domain
- Source: https://github.com/pypa/setuptools (tag v68.2.2), https://github.com/eliben/pyelftools (tag v0.26)
- Ships in: Android app (bootstrap.imy)
- Licence text: licenses/chaquopy_bootstrap_packages.txt; licenses/apache_2_0.txt (importlib_resources)


## 7. PC app: Python packages and fallback models (not redistributed)

The PC app runs from the source repository with Python 3.12 and packages that the user installs from PyPI
(requirements.txt). Meddeb does not redistribute them. If a PC bundle (an installer) is ever made, these
notices, and the obligations of the LGPL libraries below, must ship with it.

### Python packages of the PC app

- Version: as installed on 2026-10-01, listed below
- SPDX: listed below, per package
- Copyright: the authors of each package (see its licence file in the Python environment)
- Source: https://pypi.org (each package's project page)
- Ships in: PC app (installed by the user with pip; not redistributed)
- Licence text: in each installed package (site-packages/<package>.dist-info); the common ones:
  licenses/apache_2_0.txt, licenses/mpl_2_0.txt
- Packages:
  - MIT: fastapi 0.141.1, pydantic 2.13.5, onnxruntime 1.30.0, faster-whisper 1.2.1, ctranslate2 4.8.2,
    RapidFuzz 3.14.6, sounddevice 0.5.6, noisereduce 3.0.3
  - BSD-3-Clause: starlette 1.6.0, uvicorn 0.53.0, websockets 17.1, scipy 1.18.1, pandas 3.0.5,
    soundfile 0.14.0 (bundles libsndfile, LGPL-2.1-or-later), av 18.1.0 (bundles FFmpeg and LAME
    libraries, LGPL)
  - BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0: numpy 2.5.3
  - Apache-2.0: transformers 5.17.0, huggingface_hub 1.31.0, tokenizers 0.23.2, sentencepiece 0.2.2,
    python-multipart 0.0.32, requests 2.34.2, sherpa-onnx 1.13.8
  - Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND MIT:
    torch 2.14.0 (CUDA 12.6 build)
  - LGPL-2.1-or-later: soxr 1.1.0
  - MPL-2.0: certifi 2026.7.22; MPL-2.0 AND MIT: tqdm 4.70.1

### Fallback speech models of the PC app

- Version: the Hugging Face repositories listed in recite/asr/registry.py
- SPDX: Apache-2.0 (deepdml/whisper-*-ar-quran-mix-norm, tarteel-ai/whisper-*-ar-quran,
  JohnDelano/faster-whisper-base-ar-quran, MaddoggProduction/whisper-l-v3-turbo-quran-lora-dataset-mix-ct2,
  rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final); MIT (Systran/faster-whisper-large-v3,
  deepdml/faster-whisper-large-v3-turbo-ct2); unknown (HamzaSidhu786/wav2vec2-base-word-by-word-quran-asr,
  never to be shipped)
- Copyright: the authors of each model repository
- Source: https://huggingface.co (repository ids above)
- Ships in: PC app (downloaded on demand by tools/get_models.py; not redistributed); dev only (benchmark)
- Licence text: licenses/apache_2_0.txt; the MIT texts are in the model repositories


## 8. Development only

### Quran-Lab Quranic ASR benchmark

- Version: Quran-Lab/quranic-asr-benchmark (600 clips), downloaded in September 2026
- SPDX: LicenseRef-NPL-1.2 (Quran-Lab No-Profit License 1.2)
- Copyright: Copyright (c) 2026 Muno459 / Quran-Lab
- Source: https://huggingface.co/datasets/Quran-Lab/quranic-asr-benchmark (gated)
- Ships in: dev only (git-ignored; the audio is never redistributed). The committed files derived from it
  (d02_PoC/benchmark/manifests/quranlab.jsonl and the quranlab result files) stay under NPL-1.2.
- Licence text: d02_PoC/benchmark/manifests/LICENSE_NOTICE.md (the full NPL-1.2 text, in the source
  repository)

### Quran-Lab zipformer_p-arabic-v3

- Version: as evaluated in September 2026 (d02_PoC/benchmark/try_zipformer.py)
- SPDX: LicenseRef-NPL-1.2 (Quran-Lab No-Profit License 1.2)
- Copyright: Muno459 / Quran-Lab
- Source: https://huggingface.co/Quran-Lab/zipformer_p-arabic-v3
- Ships in: dev only (under evaluation, not shipped)
- Licence text: the NPL-1.2 text in d02_PoC/benchmark/manifests/LICENSE_NOTICE.md

### Benchmark audio

- Version: the clips listed in d02_PoC/benchmark/manifests/ (EveryAyah reciters, QUL reciters, Yasser
  Al-Dossary long-form surahs, learner recordings), described in d02_PoC/01_benchmark_plan.md
- SPDX: NOASSERTION (each source's own terms)
- Copyright: the reciters and publishers of each source
- Source: the sources named in d02_PoC/01_benchmark_plan.md
- Ships in: dev only (git-ignored; the committed manifests hold clip ids, durations and reference text)
- Licence text: none bundled; each source's own terms

### Build and test tools

- Version: Gradle 8.14.5, Android Gradle Plugin 8.13.2, Kotlin compiler 2.3.21, JDK 21, Android SDK
  (compile SDK 36, build-tools 36.1.0); JUnit 4.13.2 and org.json 20260814 (JVM unit tests only); pytest
- SPDX: Apache-2.0 (Gradle, Android Gradle Plugin, Kotlin); GPL-2.0-only WITH Classpath-exception-2.0
  (OpenJDK); Android Software Development Kit License Agreement; EPL-1.0 (JUnit 4); public domain
  (org.json); MIT (pytest)
- Copyright: their authors
- Source: https://gradle.org , https://developer.android.com/studio , https://openjdk.org ,
  https://junit.org/junit4/ , https://github.com/stleary/JSON-java , https://pytest.org
- Ships in: dev only (used to build and test; not inside the apps)
- Licence text: licenses/apache_2_0.txt (Gradle, Android Gradle Plugin, Kotlin); the others with each tool


## 9. Files in licenses/

- licenses/apache_2_0.txt: Apache License 2.0: AndroidX, Media3, Guava, JSpecify, Kotlin, kotlinx.coroutines,
  OpenSSL, importlib_resources, ONNX Runtime's META-INF/LICENSE-1DS
- licenses/notice_kotlin.txt: Apache 2.0 NOTICE of Kotlin (section 4(d))
- licenses/kotlin_stdlib_third_party.txt: code inside the Kotlin standard library (BSD-3-Clause, BSL-1.0)
- licenses/notice_kotlinx_coroutines.txt: Apache 2.0 NOTICE of kotlinx.coroutines
- licenses/mit_onnxruntime.txt: ONNX Runtime (MIT)
- licenses/onnxruntime_third_party_notices.txt: ONNX Runtime's own third-party notices (v1.30.0)
- licenses/mit_chaquopy.txt: Chaquopy (MIT)
- licenses/psf_2_0_cpython_3_12.txt: CPython 3.12 (PSF License 2.0)
- licenses/cpython_3_12_incorporated_software.txt: software incorporated in CPython (expat, libffi, libmpdec...)
- licenses/numpy_1_26_2.txt: NumPy (BSD-3-Clause) and the code it bundles
- licenses/openblas_0_2_20.txt: OpenBLAS (BSD-3-Clause)
- licenses/libgfortran_gcc_runtime_exception.txt: libgfortran (GPL-3.0-or-later WITH GCC-exception-3.1)
- licenses/gpl_3_0.txt: GNU General Public License v3 (for libgfortran)
- licenses/libcxx_apache_2_0_llvm_exception.txt: LLVM libc++ (Apache-2.0 WITH LLVM-exception)
- licenses/chaquopy_bootstrap_packages.txt: setuptools, pyelftools and their vendored packages
- licenses/mpl_2_0.txt: Mozilla Public License 2.0 (Mozilla CA certificates, cacert.pem)
- licenses/ofl_amiri_quran.txt: Amiri Quran font (SIL OFL 1.1)
- licenses/ofl_noto_naskh_arabic.txt: Noto Naskh Arabic font (SIL OFL 1.1)
- licenses/ofl_inter.txt: Inter font (SIL OFL 1.1)
- licenses/npl_1_1_fastconformer_quran.txt: fastconformer-quran speech model (Quran-Lab No-Profit License 1.1)
- licenses/cc_by_4_0.txt: Creative Commons Attribution 4.0 (NVIDIA base model of the speech model)
- licenses/tanzil_quran_text.txt: Tanzil Qur'an text and metadata: copyright blocks, verbatim
