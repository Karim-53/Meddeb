# Meddeb No-Profit License 1.0 (draft)

**Status: DRAFT, pending review by a lawyer.** The project is not released yet. This text states the
terms the project is meant to be published under; it is not final and it is not legal advice. Short
identifier until the final version: LicenseRef-Meddeb-NPL-1.0.

Copyright (c) 2026 Mohamed Karim Belaid

Notice to keep in every copy (Section 7):

    Copyright (c) 2026 Mohamed Karim Belaid. Meddeb is licensed under the Meddeb No-Profit License 1.0.
    Third-party components are under their own licences; see THIRD_PARTY_NOTICES.md.

The Work, as defined in Section 1, is made available under the following terms. By using, running,
copying, modifying or distributing the Work You agree to these terms. If You do not agree, You may not
use the Work.

## 1. Definitions

- "Licensor" means Mohamed Karim Belaid, the author and owner of the Work.
- "You" means the individual or entity exercising rights under this License.
- "Work" means the source code, user interface, documentation and other material authored by the
  Licensor, or contributed to the Licensor under Section 12, and distributed under this License: the
  Meddeb application (its Android, PC and web versions), the shared engine (the `recite` package), the
  tools, the benchmark scripts, the recorded-session format and the documentation. The Work excludes
  Third-Party Components.
- "Third-Party Components" means any software, model, font, text, data or audio not authored by the
  Licensor, whether bundled with the Work, downloaded by it at run time, or needed to build or run it,
  including those listed in THIRD_PARTY_NOTICES.md.
- "Derivative" means any work based on the Work that would need the Licensor's permission under copyright
  law, including modifications, forks, translations and ports (for example to another platform or
  language), and any application or service that includes the Work or a Derivative. Output produced by
  running the Work (recordings, profiles, marks, logs, exports) is not a Derivative and belongs to its
  user.
- "Source Form" means the preferred form of a work for making modifications, including the scripts and
  instructions needed to build, install and run it.
- "Profit" means any financial gain, revenue or benefit obtained in connection with the Work or a
  Derivative, direct or indirect: sale, licensing for a fee, paid products or features, paid
  subscriptions, advertising revenue, and use as part of, or in support of, any revenue-generating
  product, service or operation. Amounts charged as Cost Recovery under Section 5 are not Profit.
- "Hosted Service" means making the Work or a Derivative available to other people over a network (an
  API, a web application, an inference endpoint...).
- "Local Use" means running the Work or a Derivative for yourself, on your own device or infrastructure,
  without making it available to other people over a network.
- "Cost Recovery" means charging the users of a Hosted Service no more than the actual, documented,
  strictly necessary direct costs of operating that service for those users (compute, storage,
  bandwidth). It excludes any margin, markup, profit, salaries beyond direct operation, development
  time, support fees or overhead unrelated to running the service.

## 2. Grant

Subject to the conditions below, the Licensor grants You a worldwide, royalty-free, non-exclusive,
non-transferable license to use, run, copy, modify and distribute the Work and to create and distribute
Derivatives, solely for non-profit purposes.

## 3. No profit

Unless a separate written agreement under Section 9 permits it, You may not use the Work or any
Derivative to obtain Profit. No sale, no paid product or feature, no paid subscription, no advertising
monetization, and no use as part of or in support of any revenue-generating product, service or
operation is permitted. This applies to the application or service as a whole, not only to the part
that uses the Work: an application that charges its users for anything, even for unrelated features,
may not include the Work, except Cost Recovery charged for a Hosted Service under Section 5.

## 4. Local use must be free

Local Use must be free of charge. Running the Work yourself must cost users nothing; no money may change
hands in connection with Local Use of the Work or a Derivative.

## 5. Hosted services: cost recovery only

You may operate the Work or a Derivative as a Hosted Service only on a Cost Recovery basis. You may
recover from users no more than Cost Recovery as defined above, never any amount that yields Profit, and
on reasonable request You must be able to demonstrate it. No user may be denied the service for
declining to pay.

## 6. Share-alike

6.1. If You distribute the Work or a Derivative, or make either available as a Hosted Service, You must
license it under this License (this version or any later version published by the Licensor), with no
further restrictions, and make its complete Source Form available free of charge to every recipient or
user, for as long as You distribute or host it. You must tell them where to get it. For the unmodified
Work, a pointer to the Source Form that the Licensor publishes is enough.

6.2. Every recipient of the Work or a Derivative automatically receives a license from the Licensor under
these terms. You may not impose any further restriction on the rights this License grants.

6.3. You may not sublicense the Work or a Derivative under any other license, and You may not relicense a
Derivative to remove or weaken these terms.

6.4. This Section covers only the Work and Your changes to it. Third-Party Components stay under their own
licences (Section 8): this License does not ask You to relicense them, and their own licences may add
conditions of their own (for example the share-alike terms of the speech model's licence).

## 7. Attribution and notices

You must:

- (a) keep this License file, the notice line above, THIRD_PARTY_NOTICES.md and the licence files it
  lists (the folder licenses/) in every copy of the Work or a Derivative;
- (b) credit the Work ("Meddeb by Mohamed Karim Belaid") in any application or service built on it, and
  show there the licence notices of the Work and of the Third-Party Components it includes, with the
  credits their licences require (for example under About > Licences), or a link to them;
- (c) state in a Derivative that You changed the Work, and how;
- (d) say clearly that automatic recitation feedback can be wrong and does not replace a qualified
  teacher, and never present its output as an authoritative religious ruling on anyone's recitation.

## 8. Third-party components

8.1. This License does not apply to Third-Party Components and does not grant, restrict or relicense any
right in them. Each is governed solely by its own licence or terms, listed in THIRD_PARTY_NOTICES.md;
for that component, its own licence prevails over this License.

8.2. Some of them carry stricter terms, which You must also follow:

- The speech model Muno459/fastconformer-quran is under the Quran-Lab No-Profit License 1.1
  (licenses/npl_1_1_fastconformer_quran.txt). It forbids any Profit by an application or service that
  includes the model, and states that no commercial licence for it exists. Its licence file must travel
  with it.
- Its base model, stt_ar_fastconformer_hybrid_large_pcd_v1.0 by NVIDIA, is under the Creative Commons
  Attribution 4.0 licence and must be credited.
- The Tanzil Qur'an text may only be copied verbatim: changing it is not allowed. Its copyright block
  (licenses/tanzil_quran_text.txt) must be kept and a link to https://tanzil.net shown. The Tanzil Qur'an
  metadata is under the Creative Commons Attribution 3.0 licence.
- The fonts are under the SIL Open Font License 1.1: they stay under it and may not be sold by
  themselves.
- The tajweed markup, the chapter list and the 15-line page layout come from Quran.com (Quran
  Foundation) and QUL. They are used under the Quran Foundation's terms; this License grants no right in
  them.
- The recitation audio played by Listen (Yasser Al-Dossary, from EveryAyah.com) is not part of the Work
  and is not distributed with it: it is fetched from its source for each user's own listening, under its
  rights holders' terms.

## 9. Commercial use: separate written agreement only

9.1. Any use that this License does not permit, including any use that yields Profit, requires a separate
written agreement signed by the Licensor. Contact: the address given in the Impressum of
https://karim-53.github.io/Meddeb/.

9.2. Such an agreement can cover only the Work. It grants no right in any Third-Party Component: the other
party must obtain those rights from their holders, or replace the component. No agreement will permit a
use that breaks a component's licence. In particular, a product used for Profit may not include the
fastconformer-quran model, nor any other Third-Party Component whose licence forbids it.

9.3. A commercial agreement does not reduce anyone's rights under this License.

## 10. Termination

Any use that breaches these terms immediately and automatically ends the rights granted to You under
this License. People who received the Work or a Derivative from You keep their own license as long as
they comply with it.

## 11. No warranty

The Work is provided "as is", without warranty of any kind, express or implied, including but not
limited to the warranties of merchantability, fitness for a particular purpose and non-infringement. In
no event shall the authors or copyright holders be liable for any claim, damages or other liability
arising from or in connection with the Work or its use. This text is not legal advice.

## 12. Contributions

By submitting a contribution to the Work (code, text, data, translations, artwork or anything else), You
license it under this License and also grant the Licensor a perpetual, worldwide, non-exclusive,
irrevocable, royalty-free right to use, modify, sublicense and license it under other terms, including
commercial terms (Section 9). You confirm that the contribution is Your own work, or that You otherwise
have the right to submit it on these terms, including with respect to Your employer. See
CONTRIBUTING.md in the source repository.

---

## Draft notes (not part of the License)

Changes from the September 2026 draft ("NPL-1.0 draft"), to meet the three goals of 2026-10-01
(02_requirements.md P0.6):

- Respect every dependency's licence: the Work no longer includes "any file distributed alongside it";
  Third-Party Components are defined, excluded from the Work and listed in THIRD_PARTY_NOTICES.md with
  their licence texts in licenses/ (Section 8). The old Section 6 ("no additional or different terms",
  "any other license") read as if it applied to them, which conflicts with the OFL and with Tanzil's
  verbatim rule.
- No commercial use except by a written agreement: the old Section 9 (no commercial license would ever
  be granted) ruled out dual licensing; Section 9 now allows a separate written agreement covering
  only the Licensor's own work, never the NPL-1.1 speech model. Section 12 makes contributions
  relicensable so that such an agreement stays possible.
- Share-alike: the old text required distributing every Derivative but no source code, did not cover
  hosted services, and its "Derivative" captured the users' own recordings and profiles. Section 6 now
  requires the complete Source Form, free of charge, for distributed and hosted Derivatives, and user
  output is excluded from "Derivative".

TODO before publication (inchallah when the project is released):

- [ ] Have the text reviewed by a lawyer: governing law and venue, severability, the Profit definition
  next to dual licensing, consumer law where the app is offered.
- [ ] Rights check: confirm that the Licensor holds every right in the Work (no claim of an employer or
  of anyone else) before signing any commercial agreement (Section 9).
- [ ] Contact address for Section 9 (the Impressum of the website is still to be completed).
- [ ] Quran.com / QUL data (tajweed markup, chapter list, page layout): obtain the Quran Foundation's /
  QUL's written permission to bundle it in the apps, or switch to data whose licence allows bundling.
- [ ] Replace demo_ikhlas.wav (a recording by Abdullah Basfar shipped with the model, rights not
  documented) by a recording of the author.
- [ ] Recitation audio: ask EveryAyah / the rights holders before any re-hosting (today it is streamed and
  cached on the device only).
- [ ] Check the licences of every model shipped at release (recite/asr/registry.py); never ship a model
  whose licence is unknown (w2v2_base_hamza).
- [ ] Decide whether the author's calibration recording is part of the Work (today: the author's own
  voice, not distributed).
- [ ] Publish the complete Source Form when the project is released (Section 6.1 relies on it; the
  source repository is private today).
- [ ] Pick the definitive version number and date, and drop "(draft)".
