require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const User = require("./api/models/user.model");
const TravelStory = require("./api/models/travelStory");
const path = require("path");
const authenticateToken = require("./api/utilis");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;



mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("DB connected"))
  .catch((err) => console.error("DB connection error:", err));


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "travel-stories", // Organize images in Cloudinary
    format: async () => "png", // Change format if needed
    public_id: (req, file) => Date.now() + "-" + file.originalname,
  },
});

const upload = multer({ storage });


const app = express();
app.use(express.json());

// Allow requests from your frontend and handle preflight requests
app.use(cors({
  origin: "*", // Allow all origins (for testing)
  methods: "GET,POST,PUT,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization"
}));

app.options("*", cors());



app.post("/create-account", async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: true, message: "All fields required" });
  }

  try {
    const isUser = await User.findOne({ email });
    if (isUser) {
      return res.status(400).json({ error: true, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = new User({
      fullName,
      email,
      password: hashedPassword,
    });
    await user.save();

    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "72h" }
    );

    console.log("generated access token", accessToken)

    return res.status(201).json({
      error: false,
      user: {
        fullName: user.fullName,
        email: user.email,
      },
      accessToken,
      message: "Registration successful",
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ error: true, message: "Server error, please try again later." });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and Password required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "72h" }
    );

    return res.json({
      error: false,
      message: "Login successful",
      user: { fullName: user.fullName, email: user.email },
      accessToken,
    });
  } catch (error) {
    console.error("Error logging in:", error);
    return res.status(500).json({ error: true, message: "Server error, please try again later." });
  }
});

app.get("/get-user", authenticateToken, async (req, res) => {
  const { userId } = req.user;

  try {
    const isUser = await User.findOne({ _id: userId });

    if (!isUser) {
      return res.sendStatus(401);
    }

    return res.json({
      user: isUser,
      message: "",
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({ error: true, message: "Server error, please try again later." });
  }
});

const BASE_URL = process.env.BASE_URL || "http://localhost:8000"; // Use env variable

app.post("/image-upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ error: true, message: "No image uploaded" });
    }

    res.status(200).json({ imageUrl: req.file.path }); // Cloudinary URL
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});


app.delete("/delete-image", async (req, res) => {
  const { imageUrl } = req.query;

  if (!imageUrl) {
    return res
      .status(400)
      .json({ error: true, message: "ImageUrl parameter is required" });
  }

  try {
    // Extract the public ID from the Cloudinary URL
    const publicId = imageUrl.split("/").pop().split(".")[0];

    // Delete the image from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    res.status(200).json({ message: "Image deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});


app.use("/assets", express.static(path.join(__dirname, "assets")));

app.post("/add-travel-story", authenticateToken, async (req, res) => {
  const { title, story, visitedLocation, imageUrl, visitDate } = req.body;
  const { userId } = req.user;

  if (!title || !visitedLocation || !imageUrl || !visitDate) {
    return res.status(400).json({ error: true, message: "All fields required" });
  }

  const parsedVisitedDate = new Date(parseInt(visitDate));

  try {
    const travelStory = new TravelStory({
      title,
      story,
      visitedLocation,
      userId,
      imageUrl,
      visitDate: parsedVisitedDate,
    });

    await travelStory.save();
    res.status(201).json({ story: travelStory, message: "Added successfully" });
  } catch (error) {
    console.error("Error adding travel story:", error);
    res.status(500).json({ error: true, message: "Server error, please try again later." });
  }
});

app.get("/get-all-story", authenticateToken, async (req, res) => {
    const { userId } = req.user;

    try {
        const travelStories = await TravelStory.find({ userId: userId }).sort({ isFavourite: -1 });
        res.status(200).json({stories: travelStories});
    } catch (error) {
        res.status(500).json({error: true, message: error.message});
    }

})

app.get("/get-travel-story/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { userId } = req.user;

  try {
    const travelStory = await TravelStory.findOne({ _id: id, userId: userId })
      .populate('collaborators', 'fullName email');  // Populate collaborator data

    if (!travelStory) {
      return res.status(404).json({ error: true, message: "Travel story not found" });
    }

    res.status(200).json({ story: travelStory });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});


app.put("/edit-story/:id", authenticateToken, async (req, res)=> {
  const { id } = req.params;
  const { title, story, visitedLocation, imageUrl, visitDate } = req.body;
  const { userId } = req.user;

  if (!title || !visitedLocation || !visitDate) {
    return res.status(400).json({ error: true, message: "All fields required" });
  }

  const parsedVisitedDate = new Date(parseInt(visitDate));

  try {
    const travelStory = await TravelStory.findOne({ _id: id, userId: userId });

    if(!travelStory){
       return res.status(404).json({error: true, message: "Travel story not found"});
    }

    const placeholderImageUrl = 'http://localhost:8000/assets/placeholder.png';

    travelStory.title = title;
    travelStory.story = story;
    travelStory.visitedLocation = visitedLocation;
    travelStory.imageUrl = imageUrl || placeholderImageUrl;
    travelStory.visitDate = parsedVisitedDate;

    await travelStory.save();
    res.status(200).json({story: travelStory, message: 'Update successful' });
  } catch (error) {
    res.status(500).json({error: true, message: error.message});
  }
})

app.delete("/delete-story/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { userId } = req.user;

  try {
    const travelStory = await TravelStory.findOne({_id: id, userId: userId})

    if(!travelStory){
      return res
      .status(404)
      .json({error: true, message: "Travel story not found"})
    }
    await travelStory.deleteOne({_id: id, userId: userId})

    const imageUrl = travelStory.imageUrl;

    res.status(200).json({message: "Travel story deleted successfully"})
  } catch (error) {
    res.status(500).json({error: true, message: error.message})
  }
})

app.put("/update-is-Favourite/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { isFavourite } = req.body;
  const { userId } = req.user;

  console.log("Request to update isFavourite:", { id, isFavourite, userId });

  try {
    const travelStory = await TravelStory.findOne({_id: id, userId: userId });

    if(!travelStory){
      return res.status(404).json({error: true, message: "Travel story not found"})
    }

    travelStory.isFavourite = isFavourite;

    await travelStory.save();
    res.status(200).json({story: travelStory, message: "Update successful"})
  } catch (error) {
    console.error("Error updating isFavourite:", error);
    res.status(500).json({ error: true, message: error.message })
  }
});

app.put("/add-collaborator/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;  // Travel story ID
  const { collaboratorEmail } = req.body;  // Collaborator's email to invite

  const { userId } = req.user;  // Current user (who is inviting)

  try {
    const travelStory = await TravelStory.findOne({ _id: id, userId: userId });

    if (!travelStory) {
      return res.status(404).json({ error: true, message: "Travel story not found or you're not the owner" });
    }

    // Find the user to be added as a collaborator by their email
    const collaborator = await User.findOne({ email: collaboratorEmail });

    if (!collaborator) {
      return res.status(404).json({ error: true, message: "Collaborator not found" });
    }

    // Add the collaborator to the story (avoid duplicates)
    if (!travelStory.collaborators.includes(collaborator._id)) {
      travelStory.collaborators.push(collaborator._id);
      await travelStory.save();
      res.status(200).json({ message: "Collaborator added successfully", travelStory });
    } else {
      res.status(400).json({ error: true, message: "User is already a collaborator" });
    }
  } catch (error) {
    console.error("Error adding collaborator:", error);
    res.status(500).json({ error: true, message: error.message });
  }
});

app.put("/remove-collaborator/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;  // Travel story ID
  const { collaboratorEmail } = req.body;  // Collaborator's email to remove

  const { userId } = req.user;  // Current user (who is removing the collaborator)

  try {
    const travelStory = await TravelStory.findOne({ _id: id, userId: userId });

    if (!travelStory) {
      return res.status(404).json({ error: true, message: "Travel story not found or you're not the owner" });
    }

    // Find the user to be removed as a collaborator
    const collaborator = await User.findOne({ email: collaboratorEmail });

    if (!collaborator) {
      return res.status(404).json({ error: true, message: "Collaborator not found" });
    }

    // Remove the collaborator from the story
    const index = travelStory.collaborators.indexOf(collaborator._id);
    if (index > -1) {
      travelStory.collaborators.splice(index, 1);
      await travelStory.save();
      res.status(200).json({ message: "Collaborator removed successfully", travelStory });
    } else {
      res.status(400).json({ error: true, message: "User is not a collaborator" });
    }
  } catch (error) {
    console.error("Error removing collaborator:", error);
    res.status(500).json({ error: true, message: error.message });
  }
});



app.get("/search", authenticateToken, async (req, res) => {
  const { query } = req.query;
  const { userId } = req.user;

  if (!query) {
    return res.status(404).json({ error: true, message: "query is required" });
  }
  try {
    const searchResults = await TravelStory.find({
      userId: userId,
      $or: [
        { title: { $regex: query, $options: "i" } },
        { story: { $regex: query, $options: "i" } },
        { visitedLocation: { $regex: query, $options: "i" } }
      ],
    }).sort({ isFavourite: -1 });

    // Send the search results back to the client
    res.json({ stories: searchResults });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

app.get("/travel-stories/filter", authenticateToken, async (req, res) => {
  const { startDate, endDate } = req.query;
  const { userId }= req.user;

  try {
    const start = new Date(parseInt(startDate));
    const end = new Date(parseInt(endDate));

    const filteredStory = await TravelStory.find({
      userId: userId,
      visitDate: {$gte: start, $lte: end}
    }).sort({ isFavourite: -1})
    res.status(200).json({ stories: filteredStory})
  } catch (error) {
    res.status(500).json({ error: error, message: error.message})
  }
})

app.listen(8000, () => {
  console.log("Server is running on port 8000");
});
app.get('/', (req, res) => {
  res.send('Backend is running!');
});



module.exports = app;
