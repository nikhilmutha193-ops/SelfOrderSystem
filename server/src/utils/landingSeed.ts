import { Types } from "mongoose";

import Award from "../models/Award";
import Restaurant from "../models/Restaurant";
import Review from "../models/Review";
import TeamMember from "../models/TeamMember";
import { HttpError } from "./httpError";

const SAMPLE_TAGLINE = "Filter coffee, dosas and everything in between.";
const SAMPLE_ABOUT =
  "We started as a small neighbourhood kitchen with one idea: serve the food we grew up on, " +
  "made fresh every morning. Everything on our menu is cooked to order, so pull up a chair and stay a while.";

export async function seedLandingContent(restaurantId: Types.ObjectId | string): Promise<string[]> {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  const added: string[] = [];

  const updates: Record<string, unknown> = {};
  if (!restaurant.tagline) updates.tagline = SAMPLE_TAGLINE;
  if (!restaurant.aboutText) updates.aboutText = SAMPLE_ABOUT;
  if (Object.keys(updates).length > 0) {
    await Restaurant.updateOne({ _id: restaurant._id }, { $set: updates });
    added.push(...Object.keys(updates).map((k) => (k === "aboutText" ? "about text" : "tagline")));
  }

  if ((await TeamMember.countDocuments({ restaurantId: restaurant._id })) === 0) {
    await TeamMember.insertMany([
      {
        restaurantId: restaurant._id,
        role: "owner",
        name: "Sample Owner",
        title: "Founder",
        bio: "Runs the floor and remembers every regular's order.",
        sortOrder: 0,
        isActive: true,
      },
      {
        restaurantId: restaurant._id,
        role: "chef",
        name: "Sample Head Chef",
        title: "Head Chef",
        bio: "Twenty years behind a dosa griddle.",
        sortOrder: 1,
        isActive: true,
      },
    ]);
    added.push("2 team members");
  }

  if ((await Award.countDocuments({ restaurantId: restaurant._id })) === 0) {
    await Award.create({
      restaurantId: restaurant._id,
      title: "Best Neighbourhood Cafe",
      issuer: "Sample City Food Awards",
      year: new Date().getFullYear() - 1,
      description: "Sample award - replace with your own.",
      sortOrder: 0,
      isActive: true,
    });
    added.push("1 award");
  }

  if ((await Review.countDocuments({ restaurantId: restaurant._id })) === 0) {
    await Review.create({
      restaurantId: restaurant._id,
      customerName: "Sample Guest",
      rating: 5,
      comment: "Lovely filter coffee and quick service. Sample review - edit or delete it under Reviews.",
      isApproved: true,
    });
    added.push("1 review");
  }

  return added;
}
