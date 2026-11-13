const { randomUUID } = require("node:crypto");

// Nous ajouterons ici les prix définitifs des miels.
const TARIFS_CENTIMES = {};

function reponse(statusCode, donnees) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(donnees)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reponse(405, { erreur: "Méthode non autorisée" });
  }

  const cle = process.env.SUMUP_API_KEY;
  const commerçant = process.env.SUMUP_MERCHANT_CODE;

  if (!cle || !commerçant) {
    return reponse(503, { erreur: "Configuration incomplète" });
  }

  let commande;

  try {
    commande = JSON.parse(event.body || "{}");
  } catch {
    return reponse(400, { erreur: "Commande invalide" });
  }

  const articles = commande.items;

  if (!Array.isArray(articles) ||
      articles.length === 0 ||
      articles.length > 20) {
    return reponse(400, { erreur: "Panier invalide" });
  }

  let nombrePots = 0;
  let totalCentimes = 0;

  for (const article of articles) {
    if (
      typeof article?.id !== "string" ||
      !Object.hasOwn(TARIFS_CENTIMES, article.id) ||
      !Number.isInteger(article.quantity) ||
      article.quantity < 1 ||
      article.quantity > 48
    ) {
      return reponse(400, { erreur: "Article invalide" });
    }

    nombrePots += article.quantity;
    totalCentimes +=
      TARIFS_CENTIMES[article.id] * article.quantity;
  }

  if (nombrePots < 2) {
    return reponse(400, {
      erreur: "Commande minimum : 2 pots"
    });
  }

  // Colissimo sera ajouté après validation des tarifs.
  if (commande.livraison !== "retrait") {
    return reponse(400, {
      erreur: "Livraison en cours de configuration"
    });
  }

  if (!Number.isSafeInteger(totalCentimes) ||
      totalCentimes <= 0) {
    return reponse(400, {
      erreur: "Tarifs non configurés"
    });
  }

  try {
    const paiement = await fetch(
      "https://api.sumup.com/v0.1/checkouts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cle}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          checkout_reference: randomUUID(),
          amount: totalCentimes / 100,
          currency: "EUR",
          merchant_code: commerçant,
          description: "Commande Rucher de la Louve Noire",
          hosted_checkout: { enabled: true },
          ...(process.env.URL
            ? { redirect_url: process.env.URL }
            : {})
        })
      }
    );

    const resultat = await paiement.json();

    if (!paiement.ok || !resultat.hosted_checkout_url) {
      return reponse(502, {
        erreur: "Impossible de préparer le paiement"
      });
    }

    return reponse(200, {
      checkoutUrl: resultat.hosted_checkout_url,
      checkoutId: resultat.id
    });
  } catch {
    return reponse(502, {
      erreur: "Connexion SumUp indisponible"
    });
  }
};
