{
    "info": {
      "name": "JoyJuice API Tests",
      "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "item": [
      {
        "name": "Clients",
        "item": [
          {
            "name": "Liste tous les clients",
            "request": {
              "method": "GET",
              "url": "{{base_url}}/clients",
              "header": []
            }
          },
          {
            "name": "Client par ID",
            "request": {
              "method": "GET",
              "url": "{{base_url}}/clients/718",
              "header": []
            }
          },
          {
            "name": "Champ spécifique client",
            "request": {
              "method": "GET",
              "url": "{{base_url}}/clients/718/Tel",
              "header": []
            }
          },
          {
            "name": "Mise à jour téléphone client",
            "request": {
              "method": "PATCH",
              "url": "{{base_url}}/clients/718/Tel",
              "header": [
                {
                  "key": "Content-Type",
                  "value": "application/json"
                }
              ],
              "body": {
                "mode": "raw",
                "raw": "{\n    \"Tel\": \"0601020304\"\n}"
              }
            }
          }
        ]
      },
      {
        "name": "Livraisons",
        "item": [
          {
            "name": "Liste livraisons du mois",
            "request": {
              "method": "GET",
              "url": "{{base_url}}/livraisons",
              "header": []
            }
          },
          {
            "name": "Création livraison",
            "request": {
              "method": "POST",
              "url": "{{base_url}}/livraisons",
              "header": [
                {
                  "key": "Content-Type",
                  "value": "application/json"
                }
              ],
              "body": {
                "mode": "raw",
                "raw": "{\n    \"ID_Livraison\": \"L0001\",\n    \"Date_Livraison\": \"25/10/2024\",\n    \"ID_Client\": \"718\",\n    \"Total_livraison\": \"150.00\",\n    \"Statut_L\": \"En cours\"\n}"
              }
            }
          }
        ]
      },
      {
        "name": "Détails Livraisons",
        "item": [
          {
            "name": "Détails d'une livraison",
            "request": {
              "method": "GET",
              "url": "{{base_url}}/detailslivraisons/L0001",
              "header": []
            }
          },
          {
            "name": "Ajout détail livraison",
            "request": {
              "method": "POST",
              "url": "{{base_url}}/detailslivraisons",
              "header": [
                {
                  "key": "Content-Type",
                  "value": "application/json"
                }
              ],
              "body": {
                "mode": "raw",
                "raw": "{\n    \"ID_Detail_Livraison\": \"L0001-P001\",\n    \"ID_Livraison\": \"L0001\",\n    \"ID_Produit\": \"P001\",\n    \"Quantite\": \"5\",\n    \"prix_unit_livraison\": \"10.00\",\n    \"Total_Ligne\": \"50.00\"\n}"
              }
            }
          }
        ]
      },
      {
        "name": "Produits",
        "item": [
          {
            "name": "Liste tous les produits",
            "request": {
              "method": "GET",
              "url": "{{base_url}}/produits",
              "header": []
            }
          },
          {
            "name": "Produit par ID",
            "request": {
              "method": "GET",
              "url": "{{base_url}}/produits/P001",
              "header": []
            }
          }
        ]
      }
    ]
  }