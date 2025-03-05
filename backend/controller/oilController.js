import Oil from '../models/oil.model.js';

export const createOil = async (req , res)=>{
    try {
        const {id , oil_name , oil_cost , oil_quantity} = req.body;

        //Validate required fields
        if(!id || !oil_name || !oil_cost || !oil_quantity){
            return res.status(400).json({success:false ,message: "Please provide all required fields" });
        }

        //Create new Oil
        const newOil = new Oil({
            id,
            oil_name,
            oil_cost,
            oil_quantity
        });

        await newOil.save();//we insert the data here
        res.status(200).json({success:true , message:"Oil data inserted successfully" , data:newOil});
    } catch (error) {
        res.status(500).json({success:false , message: "Server error", error: error.message });
    }
};
/*
{
  "_id": ObjectId("oil_id"),
  "oil_name": "Oil Name",
  "oil_cost": 5.00,
  "oil_quantity": 50,
  "status": "available",
  "created_at": ISODate("2025-03-04T12:00:00Z"),
  "updated_at": ISODate("2025-03-04T12:05:00Z")
}
*/