# Traçabilité des règles - `@boussole/engine`

Table `ruleId` → description FR → référence de la méthode (sections de `SPEC.md`) → fichier:fonction → fixtures golden.

Chaque fonction porte `@ruleRef <ID>`.

| ruleId | Description FR | Référence | Fichier:fonction | Fixtures golden |
|--------|----------------|-------------------|------------------|-----------------|
| T-ROUND | Arrondi de chaque température au 0,05 °C le plus proche | Température / Arrondi | `temperature.js:roundToFiveHundredths` | `T-ROUND` |
| T-LTL | LTL = max des 6 relevés valables précédents, dans `ltlWindowMaxDays` | Température / LTL | `temperature.js:computeLtl` | `T-LTL` |
| T-STD | 3 relevés > LTL et 3ᵉ ≥ LTL + 0,2 °C | Température / Règle standard | `temperature.js:evaluateStandardShift` | `T-STD`, `T-LONG`, `T-STD-AFTER` |
| T-EX1 | 3 > LTL mais 3ᵉ < +0,2 ⇒ 4ᵉ > LTL | Température / Exception 1 | `temperature.js:evaluateException1` | `T-EX1` |
| T-EX2 | Un seul des jours 2/3 ≤ LTL ⇒ 4ᵉ ≥ LTL + 0,2 | Température / Exception 2 | `temperature.js:evaluateException2` | `T-EX2` |
| M-PEAK | Pic glaire = dernier jour de la meilleure qualité ; jamais si max < 2 ; 3 jours strictement inférieurs | Glaire / Jour du pic | `mucus.js:findPeak` | `M-PEAK` |
| M-EXT | Surveillance étendue jusqu’à la fin d’évaluation température ; pic invalidé si qualité ≥ pic | Glaire / Double vérification | `mucus.js:extendSurveillance` | `M-EXT` |
| C-PEAK | Même mécanisme, « fermé et ferme » | Glaire / Variante col | `cervix.js:findPeak` | `C-PEAK` |
| C-EXT | Surveillance étendue col | Glaire / Variante col | `cervix.js:extendSurveillance` | `C-EXT` |
| X-LATER | Les deux signes indépendants ; le plus tardif gagne | Combiner les deux signes | `combine.js:latestWins` | `X-LATER` |
| X-BLOCK | Les deux signes bloquants ; un seul ne suffit jamais | Combiner les deux signes | `combine.js:bothRequired` | `X-BLOCK` |
| P-NONE | Pas de pré-ovulatoire si le cycle précédent n’a pas de hausse confirmée | Pré-ovulatoire | `preovulatory.js:requirePreviousShift` | `P-NONE` |
| P-5DAY | 5 jours par défaut ; la fenêtre s'arrête avant le premier jour observé sans signe secondaire applicable (absence de signal ≠ infertilité, contrat §9, issue #74) | Pré-ovulatoire / 5 jours | `preovulatory.js:defaultFiveDays`, `endBeforeGap` | `P-5DAY` |
| P-M8 | Min des 1ers points hauts − 8 ; raccourcit toujours ; n’allonge au-delà de 5 que si ≥ 12 cycles exploitables | Pré-ovulatoire / moins 8 | `preovulatory.js:minusEight` | `P-M8` |
| P-M8-GAP | Un cycle précédent illisible (au moins une température) plafonne « moins 8 » à son premier candidat et n'allonge pas la fenêtre (#130) ; sans température il reste ignoré | Contrat §9 | `preovulatory.js:unreadableCandidateDay` | `P-M8-GAP` |
| P-M8-ZERO | `firstHighDay - 8 === 0` n’est pas falsy : 0 jour pré-ovu est légitime | Garde-fou (audit 2026-09-11) | `preovulatory.js:minusEight` | `P-M8-ZERO` |
| P-STOP | Arrêt immédiat sur glaire ≥ 2 ou col ouvert/mou | Pré-ovulatoire / arrêt | `preovulatory.js:stopOnFertileSign` | `P-STOP` |
| S-START | Début de cycle = saignement ≥ léger, sans saignement non exclu J-1 et J-2 | Contrat §6 | `cycles.js:detectCycleStarts` | `S-START` |
| D-GAP-LTL | 6 relevés valables dans `ltlWindowMaxDays` (défaut 9) sinon `evaluable:false` | Données manquantes / LTL | `gaps.js:assertLtlWindow` | `D-GAP-LTL` |
| D-GAP-CONF | Fenêtre de confirmation stricte : un trou ⇒ refus | Données manquantes / glaire | `gaps.js:assertConfirmationWindow` | `D-GAP-CONF` |
| D-EXCL | `excluded: true` ≡ absent pour le calcul | Perturbation / parenthèses | `gaps.js:isPresentForCalc` | `D-EXCL` |
| X-POST | **Règle propre à Boussole, pas une règle de la méthode** : après la validation, glaire/col lus chaque jour ; signe fertile (glaire ≥ 2, col ouvert/mou) ⇒ la phase infertile s'arrête ; jour sans signe ⇒ incertain. Ne fait que retirer des jours infertiles (contrat §2 ter, issue #86) | - (décision de l'auteur) | `postovulatory.js:surveillePostOvulatory` | `X-POST` |
| D-OUTLIER | Warning `possible_outlier_temperature`, jamais d’exclusion auto ; **phase basse seulement** (avant le 1er point haut d'une hausse confirmée, issue #11) | Perturbation / jugement | `outliers.js:flagTemperature` | `D-OUTLIER` |
