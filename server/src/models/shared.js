import mongoose from "mongoose";

export const objectId = mongoose.Schema.Types.ObjectId;

export const tenantFields = {
  business: { type: objectId, ref: "Business", required: true, index: true },
};

export const baseOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: (_document, value) => {
      delete value._id;
      return value;
    },
  },
};
