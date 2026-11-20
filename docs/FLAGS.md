# Feature-flag catalogue

Snapshot of `flags/catalogue.json` (KX-08 section 09; default state **ON**). Rules (ADR-023..025): every capability ships ON; OFF makes new actions answer `403 FEATURE_DISABLED {key, scope}` and never hides data; launch-locked flags are effective only with human-recorded gate evidence; safety controls are never flags (`flags/safety-never-flags.json`).

| Key | Product | Class | Scopes | Depends on | Launch-locked | When OFF |
|---|---|---|---|---|---|---|
| `clinic.kiorex_listing` | kiorly-clinic | Module | global, market, org | `kiorex.marketplace` | no | Listings PAUSED on Kiorex; confirmed bookings honoured; booking link still works |
| `clinic.commission_settlement` | kiorly-clinic | Commercial | global, market | `clinic.kiorex_listing` | no | New commission charges stop; invoices = subscription only; confirmed charges still settle |
| `clinic.kiorly_pay_deposits` | kiorly-clinic | Commercial | global, market, org |  | no | No new deposit requirements or links; existing deposits refund/convert per policy |
| `whatsapp_reminders` | kiorly-clinic | Integration | global, market, org |  | no | Reminders stop; manual call list shown |
| `clinic.whatsapp_inbound` | kiorly-clinic | Integration | global, market, org | `whatsapp_reminders` | no | Replies no longer change appointments; routed to inbox |
| `instapay` | kiorly-clinic | Integration | global, market, org |  | no | Method hidden at cashier; cash and other methods remain |
| `fawry` | kiorly-clinic | Integration | global, market, org |  | no | Method hidden at cashier; cash and other methods remain |
| `card_payments` | kiorly-clinic | Integration | global, market, org |  | no | Method hidden at cashier; cash and other methods remain |
| `ai_assistant` | kiorly-clinic | AI | global, market, org |  | no | Widget hidden; chat returns 403 |
| `clinic.ai_scribe` | kiorly-clinic | AI | global, market, org |  | no | Record button hidden; signed notes unaffected |
| `clinic.whatsapp_ai_receptionist` | kiorly-clinic | Launch-locked | global, market, org | `clinic.whatsapp_inbound` | yes (Meta approval + consent copy) | Inbound messages go to human inbox |
| `clinic.no_show_risk` | kiorly-clinic | AI | global, market, org |  | no | Risk chip hidden |
| `clinic.waitlist_autofill` | kiorly-clinic | Module | global, market, org | `whatsapp_reminders` | no | Waitlist kept; no automatic offers |
| `clinic.record_share_patient_app` | kiorly-clinic | Module | global, market, org | `kiorex.record_vault` | no | No new shares; existing shares stay visible to the patient |
| `clinic.eprescription_handoff` | kiorly-clinic | Module | global, market, org | `pharmacy.module` | no | Rx printed / WhatsApp only |
| `clinic.lab_order_handoff` | kiorly-clinic | Module | global, market, org | `lab.module` | no | Lab orders kept as records only |
| `clinic.payers_tpa` | kiorly-clinic | Module | global, market, org |  | no | Contract prices kept; no new claims |
| `clinic.specialty_templates.<code>` | kiorly-clinic | Launch-locked | global, market |  | yes (Specialty board sign-off (NH010); physio: GPR2) | Template hidden from new encounters |
| `clinic.referral_rewards` | kiorly-clinic | Commercial | global, market |  | no | No new codes; earned credits honoured |
| `clinic.field_rep_onboarding` | kiorly-clinic | Commercial | global, market |  | no | Rep codes rejected at signup; earned commissions honoured |
| `kiorex.marketplace` | kiorex | Module | global, market |  | no | Search shows clinic phone only; no new bookings; existing bookings honoured |
| `kiorex.pay_deposits` | kiorex | Commercial | global, market | `kiorex.marketplace` | no | Deposit-required visit types bookable without deposit or hidden (per market setting) |
| `kiorex.reviews` | kiorex | Module | global, market | `kiorex.marketplace` | no | No new reviews; aggregates still displayed |
| `kiorex.family_accounts` | kiorex | Module | global, market |  | no | Existing dependants kept; cannot add new |
| `kiorex.record_vault` | kiorex | Module | global, market |  | no | Vault read-only |
| `kiorex.whatsapp_booking` | kiorex | Integration | global, market | `kiorex.marketplace` | no | WhatsApp replies with app link |
| `kiorex.sponsored_listings` | kiorex | Commercial | global, market | `kiorex.marketplace` | no | Sponsored slots removed; organic ranking only |
| `kiorex.pharmacy_orders` | kiorex | Launch-locked | global, market | `pharmacy.kiorex_orders` | yes (Merchant-of-record + counsel memo (Q5)) | Pharmacy tab hidden; open orders completed or refunded |
| `kiorex.lab_bookings` | kiorex | Launch-locked | global, market | `lab.kiorex_bookings` | yes (Counsel memo) | Lab tab hidden; booked collections honoured |
| `kiorex.telemedicine` | kiorex | Launch-locked | global, market |  | yes (Clinical governance sign-off) | Video option hidden |
| `kiorex.ai_navigation` | kiorex | Launch-locked | global, market |  | yes (Clinical evaluation (KX11)) | Plain specialty search |
| `account.passkeys` | kiorex-account | Module | global, market |  | no | OTP only |
| `account.provider_sso` | kiorex-account | Module | global, market, org |  | no | Providers use product login |
| `pharmacy.module` | kiorly-pharmacy | Module | global, market, org |  | no | No new sign-ups; existing tenants read-only with export |
| `pharmacy.kiorex_orders` | kiorly-pharmacy | Module | global, market, org | `pharmacy.module` | no | Order inbox hidden; stock not exposed |
| `pharmacy.forecasting` | kiorly-pharmacy | AI | global, market, org | `pharmacy.module` | no | Min/max reorder only |
| `pharmacy.insurer_claims` | kiorly-pharmacy | Module | global, market, org | `pharmacy.module` | no | Cash/self-pay only |
| `lab.module` | kiorly-lab | Module | global, market, org |  | no | No new sign-ups; existing tenants read-only with export |
| `lab.analyzer_interfaces` | kiorly-lab | Integration | global, market, org | `lab.module` | no | Manual entry with dual control |
| `lab.home_collection` | kiorly-lab | Module | global, market, org | `lab.module` | no | Walk-in collection only |
| `lab.kiorex_bookings` | kiorly-lab | Module | global, market, org | `lab.module` | no | Not bookable from Kiorex |
| `market.<country>.live` | all | Launch-locked | global |  | yes (Market pack certification + local counsel) | Country hidden from sign-up and search; existing tenants unaffected |
| `clinic.profession.physiotherapy` | kiorly-clinic | Module | global, market |  | no | No new physio sign-ups; existing physios keep working |
| `clinic.home_visits` | kiorly-clinic | Launch-locked | global, market, org |  | yes (GHV1 + GHV2) | Home visit types hidden for new bookings; booked visits honoured |
| `clinic.home_route_view` | kiorly-clinic | Module | global, market, org | `clinic.home_visits` | no | List view only |
| `clinic.home_dispatch` | kiorly-clinic | Module | global, market, org | `clinic.home_visits` | no | Manual assignment |
| `nurse.edition` | kiorly-nurse | Module | global, market |  | no | No new Nurse sign-ups; existing tenants read-only with export |
| `nurse.individual_tenants` | kiorly-nurse | Commercial | global, market | `nurse.edition` | no | Solo plans hidden at sign-up; existing solos keep working |
| `nurse.care_plans` | kiorly-nurse | Launch-locked | global, market, org |  | yes (GKN1) | Single visits only; active plans complete |
| `nurse.mar` | kiorly-nurse | Launch-locked | global, market, org |  | yes (GKN1) | Medication recorded as free text in the visit record |
| `nurse.private_duty_shifts` | kiorly-nurse | Module | global, market, org | `nurse.edition` | no | Shift booking hidden |
| `nurse.family_updates` | kiorly-nurse | Integration | global, market, org | `whatsapp_reminders` | no | No family messages |
| `nurse.individual_kiorex_listing` | kiorly-nurse | Launch-locked | global, market | `kiorex.home_visits` | yes (GKN2) | Solo nurses not listed on Kiorex |
| `kiorex.home_visits` | kiorex | Launch-locked | global, market | `clinic.home_visits` | yes (GHV1 + GHV2) | Home filter hidden; booked home visits honoured |
| `kiorex.category.physiotherapy` | kiorex | Launch-locked | global, market |  | yes (GPR1) | Physio providers not shown |
| `kiorex.category.nursing` | kiorex | Module | global, market | `kiorex.home_visits`, `nurse.edition` | no | Home nursing not shown |
| `kiorex.visit_tracking` | kiorex | Module | global, market | `kiorex.home_visits` | no | Status timeline without on-the-way updates |

Back to the [README](../README.md) · [Docs index](INDEX.md)
