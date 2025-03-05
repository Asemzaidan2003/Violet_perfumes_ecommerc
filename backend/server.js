/*The entery point to the API*/
import express from "express";
import dotenv from "dotenv";
import {connectDB} from './config/db.js';
import productRouter from './routes/productRouts.js';
import oilRouter from './routes/oil.Routs.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
app.use(express.json())//allows us to accept JSON data in the req.body
console.log(process.env.MONGO_URI)
app.use('/api/products',productRouter);
app.use('/api/oils',oilRouter);
app.listen(port , () => {
    connectDB();
    console.log(`Server Started at port ${port}!!`)
});


