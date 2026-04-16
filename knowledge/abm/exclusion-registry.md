# ABM Exclusion Registry

> Persistent, categorized exclusion list for all ABM/buyer list building.
> Any agent (list builder, campaign reviewer, audience auditor) must check this before adding or approving companies.

## How to Use

1. **List Builder agents**: Before saving a candidate, check if the domain/company is in the exclusions below. If matched, skip.
2. **Campaign/Audience reviewers**: When auditing an audience list, flag any companies matching these exclusion categories.
3. **Adding exclusions**: When a company is manually rejected during review, add it here with the category and reason.

## Exclusion Categories

### Category: IT Reseller / System Integrator
**Rule**: Companies that sell/implement other companies' software, not building their own voice/telephony product.
**Evidence keywords**: "system integrator", "IT consulting", "reseller", "value-added reseller", "IT services provider", "managed services"

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| Storm Computers | storm.hr | HR | 2026-04-13 | Croatian ICT reseller, not voice product builder |
| Cipal Schaubroeck | cipalschaubroeck.be | BE | 2026-04-13 | Government IT consulting |
| Croz | croz.net | HR | 2026-04-13 | IT consulting/SI |
| Xylos | xylos.com | BE | 2026-04-13 | IT training/consulting |
| Soitron | soitron.com | SK | 2026-04-13 | IT solutions provider |
| Alpineon | alpineon.com | SI | 2026-04-13 | IT services |
| SoftTeco | softteco.com | LT | 2026-04-13 | Custom software dev |
| Rinf.tech | rinf.tech | RO | 2026-04-13 | Custom dev agency |
| Softec | softec.sk | SK | 2026-04-13 | Software consulting |
| Cognexa | cognexa.com | SK | 2026-04-13 | AI consulting |
| ML6 | ml6.eu | BE | 2026-04-13 | AI solutions/strategy |
| Nettle AI | nettle.ai | SK | 2026-04-13 | Conversational AI consulting |
| Sagacify | sagacify.com | BE | 2026-04-13 | AI consulting |
| Sound of Data | soundofdata.com | NL | 2026-04-13 | Contact center consulting |
| Allexis | allexis.sk | SK | 2026-04-13 | Management consulting |
| 1MillionBot | 1millionbot.com | ES | 2026-04-13 | AI consulting |
| Nextent Informatics | nextent.hu | HU | 2026-04-13 | IT applications |
| Synapse S.r.l. | synapse.it | IT | 2026-04-13 | IT services |
| Innovaway S.p.A. | innovaway.it | IT | 2026-04-13 | IT service provider |

### Category: Digital / Creative Agency
**Rule**: Companies that build websites/apps/creative for clients, not voice products.
**Evidence keywords**: "digital agency", "creative agency", "web development", "design studio", "innovation studio"

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| Bornfight | bornfight.com | HR | 2026-04-13 | Digital product agency |
| Altar | altar.io | PT | 2026-04-13 | Software dev agency |
| Pimpon | pimpon.io | FR | 2026-04-13 | Web dev agency |
| Monoceros Labs | monoceroslabs.com | ES | 2026-04-13 | Innovation studio |
| eClettica Lab | ecletticalab.com | IT | 2026-04-13 | Training center |
| Prague Labs | praguelabs.com | CZ | 2026-04-13 | Custom software dev |

### Category: Healthcare Provider (not buyer)
**Rule**: Hospitals, clinics, healthcare systems that use software but don't buy voice APIs at ABM scale.
**Evidence keywords**: Hospital names, "klinikum", "hospital", "health centre", "medical center"

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| Klinikum Stuttgart | klinikum-stuttgart.de | DE | 2026-04-13 | Hospital |
| Charité Berlin | charite.de | DE | 2026-04-13 | Hospital |
| Quirónsalud | quironsalud.com | ES | 2026-04-13 | Hospital group |
| Ida-Tallinna Keskhaigla | itk.ee | EE | 2026-04-13 | Hospital |
| Keldoc | keldoc.com | FR | 2026-04-13 | Doctor booking (healthcare provider backend) |
| Teleclinic | teleclinic.com | DE | 2026-04-13 | Digital clinic (provider, not tech buyer) |
| Hellocare | hellocare.com | FR | 2026-04-13 | Online doctor (provider) |
| Hejdoktor | hejdoktor.dk | DK | 2026-04-13 | Online healthcare provider |
| Qdoctor | qdoctor.io | UK | 2026-04-13 | Video consultations (provider) |
| Soignez-moi.ch | soignez-moi.ch | CH | 2026-04-13 | Online medical consultations |
| uLékaře.cz | ulekare.cz | CZ | 2026-04-13 | Medical advisory portal |
| IPG Belgium | ipg.be | BE | 2026-04-13 | Medical laboratory |

### Category: Insurance Company (not buyer)
**Rule**: Insurance companies with phone support lines — not voice AI buyers.

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| Achmea | achmea.nl | NL | 2026-04-13 | Insurance |
| ERGO Group | ergo.com | DE | 2026-04-13 | Insurance |
| GF Forsikring | gfforsikring.dk | DK | 2026-04-13 | Insurance |
| Hedvig | hedvig.com | SE | 2026-04-13 | Insurance |
| Chill Insurance | chill.ie | IE | 2026-04-13 | Insurance broker |
| YuLife | yulife.com | UK | 2026-04-13 | Life insurance |
| Zego | zego.com | UK | 2026-04-13 | Insurance |
| Topdanmark | topdanmark.dk | DK | 2026-04-13 | Insurance |
| Viveo Health | viveohealth.com | EE | 2026-04-13 | Insurance/digital health |

### Category: Debt Collection Agency (end user, not builder)
**Rule**: Companies that collect debt as their business. They might use dialers but aren't building voice products or buying programmable voice APIs at scale.

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| Intrum | intrum.com | SE | 2026-04-13 | $2B+ public company |
| Intrum AG | intrum.ch | CH | 2026-04-13 | Intrum subsidiary |
| Intrum Spain | intrum.es | ES | 2026-04-13 | Intrum subsidiary |
| Lowell Group | lowell.com | UK | 2026-04-13 | Credit management |
| Lowell | lowell.de | DE | 2026-04-13 | Credit management |
| Cofidis France | cofidis.fr | FR | 2026-04-13 | Consumer credit |
| Cofidis Italia | cofidis.it | IT | 2026-04-13 | Consumer credit |
| Cerved Group | cerved.com | IT | 2026-04-13 | Information provider |
| EOS Gruppe | eos-solutions.com | DE | 2026-04-13 | Debt collection |
| PAIR Finance | pairfinance.com | DE | 2026-04-13 | Debt collection |
| Cabot Financial | cabotfinancial.ie | IE | 2026-04-13 | Debt collection |
| Ardent Credit | ardentcredit.co.uk | UK | 2026-04-13 | Debt collection |
| iQera | iqera.com | FR | 2026-04-13 | Debt management |
| Sergel | sergel.com | SE | 2026-04-13 | Credit management |
| Credissimo | credissimo.bg | BG | 2026-04-13 | Online finance |
| Flanderijn | flanderijn.nl | NL | 2026-04-13 | Credit management |
| Collectia | collectia.dk | DK | 2026-04-13 | Debt collection |
| Cannock | cannock.nl | NL | 2026-04-13 | Payment issues |
| coeo Inkasso | coeo-inkasso.de | DE | 2026-04-13 | Debt collection |
| DAS Incasso | das.nl | NL | 2026-04-13 | Legal/financial services |
| Ratepay | ratepay.com | DE | 2026-04-13 | Payment solutions |
| Vesting Finance | vestingfinance.nl | NL | 2026-04-13 | Credit management |
| Syncasso | syncasso.nl | NL | 2026-04-13 | Credit management |
| Tilbago AG | tilbago.ch | CH | 2026-04-13 | Debt collection |
| Ropo Capital | ropo.com | FI | 2026-04-13 | Debt collection (domain for sale) |
| PRA Group UK | pragroup.co.uk | UK | 2026-04-13 | Debt solutions |
| GGN | ggn.nl | NL | 2026-04-13 | Bailiff agency |

### Category: Fintech / Payment (no voice product)
**Rule**: Payment processors, lending platforms, credit card companies with no voice/telephony product.

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| Mollie | mollie.com | NL | 2026-04-13 | Payment provider |
| PayPlug | payplug.com | FR | 2026-04-13 | Payment solution |
| PayU | payu.com | CZ | 2026-04-13 | Payment provider |
| Pleo | pleo.io | DK | 2026-04-13 | Company cards/expenses |
| iWoca | iwoca.co.uk | UK | 2026-04-13 | Business loans |
| Lendahand | lendahand.com | NL | 2026-04-13 | Crowdfunding |
| Swisscard | swisscard.ch | CH | 2026-04-13 | Credit card company |
| bob Finance | bob.ch | CH | 2026-04-13 | Financial solutions |
| Trustap | trustap.com | IE | 2026-04-13 | Escrow payments |
| Cetelem | cetelem.fr | FR | 2026-04-13 | BNP Paribas consumer credit |
| Webio | webio.com | IE | 2026-04-13 | Debt collection AI (borderline, but mainly fintech) |

### Category: BPO / Call Center Operator (service provider, not buyer)
**Rule**: Companies that ARE the call center / BPO. They provide call center services, not buy voice APIs.

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| Blue Point | blue-point.ro | RO | 2026-04-13 | Call center company |
| Optima | optimacall.ro | RO | 2026-04-13 | BPO |
| Pontica Solutions | ponticasolutions.com | BG | 2026-04-13 | BPO |
| 9Lives | 9lives.fi | FI | 2026-04-13 | Mobile healthcare services |
| Arvato Ireland | arvato.com | DE | 2026-04-13 | Bertelsmann BPO subsidiary |
| Valoris Center | valoris.ro | RO | 2026-04-13 | BPO |
| eMAG | emag.ro | RO | 2026-04-13 | Online retailer with support |

### Category: Competitor / Competitor-Adjacent
**Rule**: Companies that compete with Telnyx or are so adjacent that they'd never buy from us.

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| Omilia | omilia.com | GR | 2026-04-13 | Conversational AI platform (CCaaS) |
| boost.ai | boost.ai | NO | 2026-04-13 | Conversational AI platform |
| Puzzel | puzzel.com | NO | 2026-04-13 | CCaaS platform |
| Mluvii | mluvii.com | CZ | 2026-04-13 | Digital communication platform (CCaaS) |
| Synthetix | synthetix.com | UK | 2026-04-13 | Customer service platform |

### Category: Identity / Biometrics (not voice)
**Rule**: Companies doing facial recognition, identity verification, or general biometrics — not voice/speech.

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| IDEMIA | idemia.com | FR | 2026-04-13 | Biometrics/identity |
| Innovatrics | innovatrics.com | SK | 2026-04-13 | Biometrics |
| Facephi | facephi.com | ES | 2026-04-13 | Facial recognition |
| Veriff | veriff.com | EE | 2026-04-13 | Identity verification |
| iDenfy | idenfy.com | LT | 2026-04-13 | Identity verification |
| Ondato | ondato.com | UK | 2026-04-13 | KYC/identity |

### Category: Dead Domain / Non-existent
**Rule**: Domains that don't resolve or redirect to unrelated companies.

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| Umni | umni.com | EE | 2026-04-13 | Dead domain |

### Category: Too Large / Not ABM-appropriate
**Rule**: Massive public companies that wouldn't respond to ABM outreach.

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| Intrum | intrum.com | SE | 2026-04-13 | $2B+ public |
| Spotify | spotify.com | SE | 2026-04-13 | $60B+ public |
| OVHcloud | ovhcloud.com | FR | 2026-04-13 | Large cloud provider |

### Category: Misc Bad Fit
**Rule**: Companies that don't fit any category but clearly aren't voice AI buyers.

| Company | Domain | Country | Added | Notes |
|---------|--------|---------|-------|-------|
| Pindstrup | pindstrup.dk | UK | 2026-04-13 | Peat moss company (!) |
| TMT Czech | tmt.cz | CZ | 2026-04-13 | Industrial manufacturer |
| Advansys | advansys.si | SI | 2026-04-13 | Casino management |
| Spinchip | spinchip.no | NO | 2026-04-13 | Diagnostic tests |
| Sabora | sabora.fi | FI | 2026-04-13 | Pharma company |
| Nuanic | nuanic.com | FI | 2026-04-13 | Biosensors |
| Veridict | veridict.com | SE | 2026-04-13 | Shared mobility |
| Storytel | storytel.com | SE | 2026-04-13 | Audiobook subscription |
| DeepZen | deepzen.io | UK | 2026-04-13 | Audiobook production |
| Imagimob | imagimob.com | SE | 2026-04-13 | Motion/activity recognition (Infineon) |
| Storm Computers | storm.hr | HR | 2026-04-13 | ICT reseller |
| Zesium | zesium.com | DE | 2026-04-13 | Software dev, vague voice claim |
| Delti | delti.ai | SE | 2026-04-13 | People analytics |
| EmailTree AI | emailtree.ai | LU | 2026-04-13 | Email automation (!) |
| Kwalys | kwalys.com | FR | 2026-04-13 | Chatbot add-on for websites |
| Konverso | konverso.ai | FR | 2026-04-13 | IT service desk AI |
| Modjo | modjo.ai | FR | 2026-04-13 | Sales conversation intelligence |
| Sympalog | sympalog.de | DE | 2026-04-13 | Niche voice solutions |
| Synesthesia | synesthesia.it | IT | 2026-04-13 | Digital experience company |
| Smart Tribune | smart-tribune.com | FR | 2026-04-13 | FAQ/chatbot, not voice |
| Automaise | automaise.com | PT | 2026-04-13 | Customer support AI, no voice |
| Feelingstream | feelingstream.com | EE | 2026-04-13 | Conversational analytics for banking |
| PosAm | posam.sk | SK | 2026-04-13 | Software solutions, workforce management |
| Advanced | oneadvanced.com | UK | 2026-04-13 | Business software, workforce management |
| WebDoctor | webdoctor.ie | IE | 2026-04-13 | Online doctor service |
| Luscii | luscii.com | NL | 2026-04-13 | Patient monitoring |
| Medatixx | medatixx.de | DE | 2026-04-13 | Medical software, no voice |

## Campaign-Objective Exclusion Rules

When building audiences for specific campaign types, apply these additional exclusions:

| Campaign Objective | Exclude Categories | Include Categories |
|---|---|---|
| **Voice API / Programmable Voice** | Insurance, Hospitals, Fintech/Payment, BPO, Identity/Biometrics | AI Voice Builders, Speech Tech, Call Automation, Platform Builders |
| **SIP Trunking** | Identity/Biometrics, Dead domains | Contact Centers, BPOs (they USE SIP), Platform Builders, AI Voice Builders |
| **AI Voice Agent** | Insurance, Fintech, Hospitals, BPO | AI Voice Builders, Speech Tech, Conversational AI |
| **Contact Center AI** | Hospitals, Fintech/Payment | Contact Centers, BPOs (they BUY CCaaS), AI Voice Builders |
| **IoT / Wireless** | All voice categories | IoT-specific companies |

## Version History
- 2026-04-13: Initial creation from EMEA Voice AI v5 cleanup (154 excluded companies across 11 categories)
