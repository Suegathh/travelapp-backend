const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const storySchema = new Schema ({
    title: {
        type: String, 
        required: true
    },
    story: {
        type: String, 
        required: true
    },
    visitedLocation: {
        type: [String], 
        default: []
    },
    isFavourite: { 
        type: Boolean, 
        default: false
    },
    userId: {
        type: Schema.Types.ObjectId, 
        ref: "User", 
        required: true
    },
    collaborators: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },{
        role: {
            type: String,
            enum: ['viewer','editor'],
            default: 'viewer'
        }
    }],
    createdOn: {
        type: Date, 
        default: Date.now
    },
    imageUrl: {
        type: String, 
        required: true
    },
    visitDate: {type: Date, required: true}
})

module.exports = mongoose.model("TravelStory", storySchema);