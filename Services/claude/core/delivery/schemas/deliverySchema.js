// Services/claude/core/delivery/schemas/deliverySchema.js
const deliveryResponseSchema = {
  type: "DELIVERY",
  client: {
    name: "Type: string",
    zone: "Type: string"
  },
  products: [{
    ID_Produit: "Type: string",
    quantite: "Type: number",
    isFrozen: "Type: boolean"
  }],
  isReturn: "Type: boolean"
};

module.exports = { deliveryResponseSchema };